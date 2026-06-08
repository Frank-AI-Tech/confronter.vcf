# Confronter Tech Wizard Gains - VCF Contact Form

Node.js + MongoDB contact form with admin-controlled VCF downloads, pure black/white themes, full member management, and 700 member capacity.

## Features

- **Pure Black/White Themes** - Sun/moon toggle on every page
- **Admin VCF Upload** - Upload a .vcf file, toggle visibility
- **Users Get YOUR File** - They download your uploaded VCF, not auto-generated
- **700 Member Limit** - Hard cap with progress tracking
- **Duplicate Prevention** - Phone + email validation with 60+ country codes
- **Cross-Device Sync** - MongoDB backend
- **Full Admin Management:**
  - ✅ Verify / unverify members
  - ✏️ Edit member details (name, phone, email, notes)
  - 🗑️ Delete members
  - 🔍 Search + filter (all/verified/unverified)
  - 📥 Export: JSON, CSV, or combined VCF
  - 📤 Upload VCF file for users
  - 🔘 Toggle VCF visibility ON/OFF

## Deploy to Render

### 1. MongoDB Atlas
1. [mongodb.com/atlas](https://www.mongodb.com/atlas) → Free M0 cluster
2. Database Access → Add user
3. Network Access → `0.0.0.0/0`
4. Connect → Drivers → Node.js → Copy string

### 2. GitHub
```bash
git init
git add .
git commit -m "Initial"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/confronter-vcf.git
git push -u origin main
```

### 3. Render
1. [render.com](https://render.com) → New → Web Service
2. Connect repo
3. Build: `npm install` | Start: `npm start`
4. Env vars: `MONGODB_URI`, `ADMIN_PASSWORD`

## Admin Panel
- `/admin` → Password login
- Default: `ConfronterAdmin2024!`

### Member Actions
| Action | How |
|--------|-----|
| Verify | Click check-circle icon toggles verified status |
| Edit | Click pen icon → modal opens → edit name/phone/email/notes |
| Delete | Click trash icon → confirm → permanent delete |
| Export | JSON / CSV / VCF buttons in header |
| Filter | Dropdown: All / Verified / Unverified |
| Search | Type name/email/phone + Enter or Search button |

### VCF Control
1. Upload .vcf in admin panel (drag-drop or click)
2. Toggle "Visible to users" ON
3. Users who submit form auto-download YOUR file
4. Toggle OFF anytime to hide downloads

## Tech Stack
- Node.js + Express
- MongoDB + Mongoose
- EJS + Font Awesome
- Multer (uploads)
- libphonenumber-js

## License
MIT
