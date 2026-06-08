const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config for VCF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `master_${timestamp}.vcf`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/vcard' || file.mimetype === 'text/x-vcard' || file.originalname.endsWith('.vcf')) {
      cb(null, true);
    } else {
      cb(new Error('Only VCF files are allowed'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Public settings endpoint for form
app.get('/api/settings', async (req, res) => {
  try {
    const Settings = require('./models/Settings');
    const memberLimitSetting = await Settings.findOne({ key: 'memberLimit' });
    const groupLinkSetting = await Settings.findOne({ key: 'groupLink' });
    
    res.json({
      success: true,
      memberLimit: memberLimitSetting ? memberLimitSetting.value : 700,
      groupLink: groupLinkSetting ? groupLinkSetting.value : 'https://chat.whatsapp.com/G9qtX0Yuq61JjrklH8k803?s=cl&p=a&ilr=1'
    });
  } catch (error) {
    res.json({
      success: true,
      memberLimit: 700,
      groupLink: 'https://chat.whatsapp.com/G9qtX0Yuq61JjrklH8k803?s=cl&p=a&ilr=1'
    });
  }
});

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/confronter_vcf';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Error:', err.message);
  });

// Routes
const memberRoutes = require('./routes/members');
const adminRoutes = require('./routes/admin');

app.use('/api/members', memberRoutes);
app.use('/admin', adminRoutes);

// Upload endpoint
app.post('/admin/upload-vcf', upload.single('vcfFile'), (req, res) => {
  const password = req.body.password || req.query.password;
  if (password !== (process.env.ADMIN_PASSWORD || 'ConfronterAdmin2024!')) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  // Clean old uploads
  try {
    const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_'));
    files.sort().forEach((f, i) => {
      if (i < files.length - 1) {
        try { fs.unlinkSync(path.join(uploadsDir, f)); } catch (e) {}
      }
    });
  } catch (e) {}

  res.json({ success: true, message: 'VCF uploaded', filename: req.file.filename });
});

// Get uploaded VCF info - FIXED
app.get('/api/vcf-status', async (req, res) => {
  try {
    let files = [];
    try {
      files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_') && f.endsWith('.vcf'));
    } catch (e) { files = []; }

    const latest = files.sort().pop();

    let visible = false;
    try {
      const Settings = require('./models/Settings');
      const setting = await Settings.findOne({ key: 'vcfVisible' });
      visible = setting ? setting.value : false;
    } catch (e) { visible = false; }

    res.json({
      success: true,
      hasUpload: !!latest,
      filename: latest || null,
      visible: visible
    });
  } catch (error) {
    console.error('VCF status error:', error);
    res.json({ success: true, hasUpload: false, filename: null, visible: false });
  }
});

// Download uploaded VCF
app.get('/download/vcf', (req, res) => {
  try {
    let files = [];
    try {
      files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_') && f.endsWith('.vcf'));
    } catch (e) { files = []; }

    const latest = files.sort().pop();
    if (!latest) {
      return res.status(404).json({ success: false, message: 'No VCF available' });
    }

    const filePath = path.join(uploadsDir, latest);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.setHeader('Content-Type', 'text/vcard');
    res.setHeader('Content-Disposition', 'attachment; filename="Confronter_Tech_Wizard_Gains.vcf"');
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Pages
app.get('/', (req, res) => res.redirect('/form'));
app.get('/form', (req, res) => res.render('form'));
app.get('/success', (req, res) => res.render('success'));

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 404
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
