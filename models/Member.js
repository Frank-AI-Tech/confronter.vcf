const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  countryCode: {
    type: String,
    required: true,
    default: '+1'
  },
  formattedPhone: {
    type: String,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: { type: String },
  userAgent: { type: String }
});

memberSchema.index({ phone: 1 });
memberSchema.index({ email: 1 });
memberSchema.index({ createdAt: -1 });
memberSchema.index({ verified: 1 });
memberSchema.index({ phone: 1, email: 1 }, { unique: true });

module.exports = mongoose.model('Member', memberSchema);
