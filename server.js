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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/confronter_vcf';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => {
    console.error('MongoDB Error:', err.message);
    console.log('Please set MONGODB_URI in .env');
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

  // Clean up old uploads, keep only the latest
  const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_'));
  files.sort().forEach((f, i) => {
    if (i < files.length - 1) fs.unlinkSync(path.join(uploadsDir, f));
  });

  res.json({
    success: true,
    message: 'VCF uploaded successfully',
    filename: req.file.filename,
    path: req.file.path
  });
});

// Get uploaded VCF info
app.get('/api/vcf-status', (req, res) => {
  const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_'));
  const latest = files.sort().pop();

  // Check settings from query or default
  const Settings = require('./models/Settings');
  Settings.findOne({ key: 'vcfVisible' }).then(setting => {
    res.json({
      success: true,
      hasUpload: !!latest,
      filename: latest || null,
      visible: setting ? setting.value : false
    });
  }).catch(() => {
    res.json({ success: true, hasUpload: !!latest, filename: latest || null, visible: false });
  });
});

// Download uploaded VCF
app.get('/download/vcf', (req, res) => {
  const files = fs.readdirSync(uploadsDir).filter(f => f.startsWith('master_'));
  const latest = files.sort().pop();

  if (!latest) {
    return res.status(404).json({ success: false, message: 'No VCF file available' });
  }

  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', 'attachment; filename="Confronter_Tech_Wizard_Gains.vcf"');
  res.sendFile(path.join(uploadsDir, latest));
});

// Pages
app.get('/', (req, res) => res.redirect('/form'));
app.get('/form', (req, res) => res.render('form'));
app.get('/success', (req, res) => res.render('success'));

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
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
  console.log(`Form: http://localhost:${PORT}/form`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
