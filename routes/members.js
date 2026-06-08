const express = require('express');
const router = express.Router();
const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');
const Member = require('../models/Member');

const MEMBER_LIMIT = 700;

// POST /api/members - Create new member
router.post('/', async (req, res) => {
  try {
    const { fullName, phone, email, countryCode = '+1' } = req.body;

    // Log incoming request for debugging
    console.log('Form submission:', { fullName, phone, email, countryCode });

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

    // Clean phone number - remove spaces, dashes, parentheses
    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
    const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : countryCode + cleanPhone;

    console.log('Validating phone:', fullPhone);

    if (!isValidPhoneNumber(fullPhone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid phone number for country code ${countryCode}. Example: for +1 use 2345678900`
      });
    }

    const parsedPhone = parsePhoneNumberFromString(fullPhone);
    if (!parsedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Could not parse phone number'
      });
    }

    const formattedPhone = parsedPhone.formatInternational();
    const e164Phone = parsedPhone.format('E.164');

    console.log('Parsed phone:', { formattedPhone, e164Phone });

    // Check for duplicate by phone
    const existingByPhone = await Member.findOne({ phone: e164Phone });
    if (existingByPhone) {
      return res.status(409).json({
        success: false,
        message: 'This phone number is already registered',
        duplicate: true
      });
    }

    // Check for duplicate by email
    const existingByEmail = await Member.findOne({ email: email.toLowerCase() });
    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered',
        duplicate: true
      });
    }

    // Check member limit
    const memberCount = await Member.countDocuments();
    if (memberCount >= MEMBER_LIMIT) {
      return res.status(403).json({
        success: false,
        message: `Group membership is full (${MEMBER_LIMIT}/${MEMBER_LIMIT})`
      });
    }

    // Create member
    const member = new Member({
      fullName: fullName.trim(),
      phone: e164Phone,
      email: email.toLowerCase().trim(),
      countryCode,
      formattedPhone,
      verified: false,
      notes: '',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    await member.save();
    console.log('Member saved successfully:', member._id);

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
    console.error('SERVER ERROR in /api/members:', error.message);
    console.error('Full error:', error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'This phone number or email is already registered',
        duplicate: true
      });
    }

    // Return actual error message for debugging (remove in production)
    res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + error.message 
    });
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
    console.error('Error in /count:', error.message);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// GET /api/members/check
router.get('/check', async (req, res) => {
  try {
    const { phone, email } = req.query;
    const query = {};

    if (phone) {
      const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, '');
      const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : '+1' + cleanPhone;
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
    console.error('Error in /check:', error.message);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

module.exports = router;
