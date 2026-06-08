const express = require('express');
const router = express.Router();
const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');
const Member = require('../models/Member');

const MEMBER_LIMIT = 700;

// POST /api/members - Create new member
router.post('/', async (req, res) => {
  try {
    const { fullName, phone, email, countryCode = '+1' } = req.body;

    if (!fullName || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    const fullPhone = phone.startsWith('+') ? phone : countryCode + phone;

    if (!isValidPhoneNumber(fullPhone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number for country code ${countryCode}`
      });
    }

    const parsedPhone = parsePhoneNumberFromString(fullPhone);
    const formattedPhone = parsedPhone.formatInternational();
    const e164Phone = parsedPhone.format('E.164');

    const existingByPhone = await Member.findOne({ phone: e164Phone });
    if (existingByPhone) {
      return res.status(409).json({
        success: false,
        message: 'This phone number is already registered',
        duplicate: true
      });
    }

    const existingByEmail = await Member.findOne({ email: email.toLowerCase() });
    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered',
        duplicate: true
      });
    }

    const memberCount = await Member.countDocuments();
    if (memberCount >= MEMBER_LIMIT) {
      return res.status(403).json({
        success: false,
        message: `Group membership is full (${MEMBER_LIMIT}/${MEMBER_LIMIT})`
      });
    }

    const member = new Member({
      fullName: fullName.trim(),
      phone: e164Phone,
      email: email.toLowerCase().trim(),
      countryCode,
      formattedPhone,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await member.save();

    res.status(201).json({
      success: true,
      message: 'Member registered successfully!',
      data: {
        id: member._id,
        fullName: member.fullName,
        phone: member.formattedPhone,
        email: member.email,
        memberNumber: memberCount + 1,
        totalMembers: memberCount + 1
      }
    });

  } catch (error) {
    console.error('Error:', error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This phone number or email is already registered',
        duplicate: true
      });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/members/count
router.get('/count', async (req, res) => {
  try {
    const count = await Member.countDocuments();
    res.json({
      success: true,
      count,
      remaining: Math.max(0, MEMBER_LIMIT - count),
      limit: MEMBER_LIMIT
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/members/check
router.get('/check', async (req, res) => {
  try {
    const { phone, email } = req.query;
    const query = {};

    if (phone) {
      const fullPhone = phone.startsWith('+') ? phone : '+1' + phone;
      query.phone = fullPhone;
    }
    if (email) query.email = email.toLowerCase();

    const exists = await Member.findOne(query);
    res.json({
      success: true,
      exists: !!exists,
      field: exists ? (exists.phone === query.phone ? 'phone' : 'email') : null
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
