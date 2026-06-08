const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Member = require('../models/Member');
const Settings = require('../models/Settings');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ConfronterAdmin2024!';
const uploadsDir = path.join(__dirname, '..', 'uploads');

// ─── Helpers ───────────────────────────────────────────────

async function getSetting(key, defaultValue) {
  const setting = await Settings.findOne({ key });
  return setting ? setting.value : defaultValue;
}

async function setSetting(key, value) {
  let setting = await Settings.findOne({ key });
  if (setting) {
    setting.value = value;
    setting.updatedAt = new Date();
    await setting.save();
  } else {
    await Settings.create({ key, value });
  }
}

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

function getVcfDaysLeft(filename) {
  if (!filename) return 30;
  try {
    const timestamp = parseInt(filename.match(/master_(\d+)\.vcf/)?.[1]);
    if (!timestamp) return 30;
    const fileDate = new Date(timestamp);
    const now = new Date();
    const expiryDays = 30; // default expiry
    const diffDays = Math.ceil((fileDate.getTime() + expiryDays * 86400000 - now.getTime()) / 86400000);
    return Math.max(0, diffDays);
  } catch (e) {
    return 30;
  }
}

// ─── GET /admin - Login or Dashboard ───────────────────────

router.get('/', async (req, res) => {
  const password = req.query.password;

  if (password === ADMIN_PASSWORD) {
    try {
      const members = await Member.find().sort({ createdAt: -1 }).limit(100);
      const totalCount = await Member.countDocuments();
      const verifiedCount = await Member.countDocuments({ verified: true });
      const vcfStatus = await getVcfStatus();

      // Fetch settings with defaults
      const memberLimit = await getSetting('memberLimit', 800);
      const groupLink = await getSetting('groupLink', '');
      const vcfExpiryDays = await getSetting('vcfExpiryDays', 30);
      const vcfDaysLeft = getVcfDaysLeft(vcfStatus.filename);

      res.render('admin-dashboard', {
        members,
        totalCount,
        verifiedCount,
        memberLimit,
        remaining: Math.max(0, memberLimit - totalCount),
        password,
        vcfStatus,
        groupLink,
        vcfExpiryDays,
        vcfDaysLeft
      });
    } catch (error) {
      console.error('Admin dashboard error:', error);
      res.status(500).render('error', { message: 'Server error' });
    }
  } else {
    res.render('admin-login');
  }
});

// ─── GET /admin/api/members ─────────────────────────────────

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

// ─── GET /admin/api/members/:id ─────────────────────────────

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

// ─── PUT /admin/api/members/:id ─────────────────────────────

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

// ─── PATCH /admin/api/members/:id/verify ──────────────────

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

// ─── POST /admin/api/members/mark-all-verify ──────────────

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

// ─── POST /admin/api/members/mark-all-unverify ────────────

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

// ─── DELETE /admin/api/members/:id ─────────────────────────

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

// ─── BULK OPERATIONS ───────────────────────────────────────

// POST /admin/api/members/bulk-verify
router.post('/api/members/bulk-verify', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No IDs provided' });
    }
    const result = await Member.updateMany({ _id: { $in: ids } }, { verified: true });
    res.json({ success: true, message: `${result.modifiedCount} member(s) verified` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /admin/api/members/bulk-unverify
router.post('/api/members/bulk-unverify', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No IDs provided' });
    }
    const result = await Member.updateMany({ _id: { $in: ids } }, { verified: false });
    res.json({ success: true, message: `${result.modifiedCount} member(s) unverified` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /admin/api/members/bulk-delete
router.post('/api/members/bulk-delete', async (req, res) => {
  const password = req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No IDs provided' });
    }
    const result = await Member.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, message: `${result.deletedCount} member(s) deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── SETTINGS ──────────────────────────────────────────────

// PUT /admin/api/settings
router.put('/api/settings', async (req, res) => {
  const password = req.body.password || req.query.password || req.headers['x-admin-token'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const { memberLimit, groupLink, vcfExpiryDays } = req.body;

    if (memberLimit !== undefined) {
      await setSetting('memberLimit', parseInt(memberLimit));
    }
    if (groupLink !== undefined) {
      await setSetting('groupLink', groupLink);
    }
    if (vcfExpiryDays !== undefined) {
      await setSetting('vcfExpiryDays', parseInt(vcfExpiryDays));
    }

    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── VCF ───────────────────────────────────────────────────

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

// POST /admin/delete-vcf
router.post('/delete-vcf', async (req, res) => {
  const password = req.body.password || req.query.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const files = fs.existsSync(uploadsDir)
      ? fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_') && f.endsWith('.vcf'))
      : [];
    files.forEach(f => {
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch (e) {}
    });

    // Also hide VCF from form
    await setSetting('vcfVisible', false);

    res.json({ success: true, message: 'VCF removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── EXPORTS ───────────────────────────────────────────────

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
