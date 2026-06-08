const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Member = require('../models/Member');
const Settings = require('../models/Settings');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ConfronterAdmin2024!';
const uploadsDir = path.join(__dirname, '..', 'uploads');

async function getVcfStatus() {
  const files = fs.existsSync(uploadsDir) 
    ? fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_') && f.endsWith('.vcf')) 
    : [];
  const latest = files.sort().pop();
  const setting = await Settings.findOne({ key: 'vcfVisible' });
  return {
    hasUpload: !!latest,
    filename: latest || null,
    visible: setting ? setting.value : false
  };
}

// GET /admin - Login or Dashboard
router.get('/', async (req, res) => {
  const password = req.query.password;

  if (password === ADMIN_PASSWORD) {
    try {
      const members = await Member.find().sort({ createdAt: -1 }).limit(100);
      const totalCount = await Member.countDocuments();
      const verifiedCount = await Member.countDocuments({ verified: true });
      const vcfStatus = await getVcfStatus();

      res.render('admin-dashboard', { 
        members, 
        totalCount, 
        verifiedCount,
        memberLimit: 700,              // <-- FIXED: was `limit`, now `memberLimit`
        remaining: Math.max(0, 700 - totalCount),
        password,
        vcfStatus
      });
    } catch (error) {
      res.status(500).render('error', { message: 'Server error' });
    }
  } else {
    res.render('admin-login');
  }
});

// GET /admin/api/members
router.get('/api/members', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const filter = req.query.filter || 'all';

    let query = {};
    if (search) {
      query = {
        $or: [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      };
    }
    if (filter === 'verified') query.verified = true;
    if (filter === 'unverified') query.verified = false;

    const members = await Member.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Member.countDocuments(query);

    res.json({
      success: true,
      members,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /admin/api/members/:id
router.get('/api/members/:id', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /admin/api/members/:id - Update member
router.put('/api/members/:id', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { fullName, phone, email, countryCode, notes } = req.body;
    const updateData = {};

    if (fullName) updateData.fullName = fullName.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (notes !== undefined) updateData.notes = notes;
    if (phone && countryCode) {
      const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');
      const fullPhone = phone.startsWith('+') ? phone : countryCode + phone;
      if (isValidPhoneNumber(fullPhone)) {
        const parsed = parsePhoneNumberFromString(fullPhone);
        updateData.phone = parsed.format('E.164');
        updateData.formattedPhone = parsed.formatInternational();
        updateData.countryCode = countryCode;
      }
    }

    const member = await Member.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!member) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, member });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Phone or email already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /admin/api/members/:id/verify - Toggle verified status
router.patch('/api/members/:id/verify', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const member = await Member.findById(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: 'Not found' });

    member.verified = !member.verified;
    await member.save();

    res.json({ 
      success: true, 
      verified: member.verified,
      message: member.verified ? 'Member verified' : 'Member unverified'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /admin/api/members/mark-all-verify - Mark ALL as verified
router.post('/api/members/mark-all-verify', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const result = await Member.updateMany({}, { verified: true });
    res.json({ 
      success: true, 
      message: `All ${result.modifiedCount} members marked as verified`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /admin/api/members/mark-all-unverify - Mark ALL as unverified
router.post('/api/members/mark-all-unverify', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const result = await Member.updateMany({}, { verified: false });
    res.json({ 
      success: true, 
      message: `All ${result.modifiedCount} members marked as unverified`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /admin/api/members/:id
router.delete('/api/members/:id', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    await Member.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Member deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Toggle VCF visibility
router.post('/toggle-vcf', async (req, res) => {
  const password = req.body.password || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    let setting = await Settings.findOne({ key: 'vcfVisible' });
    const newValue = !(setting ? setting.value : false);

    if (setting) {
      setting.value = newValue;
      setting.updatedAt = new Date();
      await setting.save();
    } else {
      await Settings.create({ key: 'vcfVisible', value: newValue });
    }

    res.json({ success: true, visible: newValue });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /admin/export - JSON export
router.get('/export', async (req, res) => {
  const password = req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const members = await Member.find().sort({ createdAt: -1 });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="members.json"');
    res.json({
      group: 'Confronter Tech Wizard Gains',
      exportedAt: new Date().toISOString(),
      totalMembers: members.length,
      members
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /admin/export-csv - CSV export
router.get('/export-csv', async (req, res) => {
  const password = req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const members = await Member.find().sort({ createdAt: -1 });
    let csv = 'ID,Full Name,Phone,Email,Country Code,Verified,Notes,Joined Date,IP Address\n';

    members.forEach(m => {
      csv += `"${m._id}","${m.fullName}","${m.formattedPhone}","${m.email}","${m.countryCode}",${m.verified},"${(m.notes || '').replace(/"/g, '""')}","${m.createdAt.toISOString()}","${m.ipAddress || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /admin/export-vcf - Export all members as combined VCF
router.get('/export-vcf', async (req, res) => {
  const password = req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const members = await Member.find().sort({ createdAt: -1 });
    let combinedVCF = '';

    members.forEach(m => {
      const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      combinedVCF += `BEGIN:VCARD\nVERSION:3.0\nFN:${m.fullName}\nN:${m.fullName.split(' ').reverse().join(';')};;;\nTEL;TYPE=CELL:${m.formattedPhone}\nEMAIL;TYPE=INTERNET:${m.email}\nORG:Confronter Tech Wizard Gains\nNOTE:${m.notes || 'Member of Confronter Tech Wizard Gains Group'}\nREV:${timestamp}\nEND:VCARD\n\n`;
    });

    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename="all_members.vcf"');
    res.send(combinedVCF);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
