# VerbiForge Access Guide

## 🚀 **Quick Access to Your Project**

### **Live URLs**
- **Main Site**: https://verbiforge.onrender.com
- **Admin Panel**: https://verbiforge.onrender.com/admin.html
- **User Dashboard**: https://verbiforge.onrender.com/dashboard.html
- **Login**: https://verbiforge.onrender.com/login.html
- **Signup**: https://verbiforge.onrender.com/signup.html

### **Admin Credentials**
- **Primary Admin**: `sid@verbiforge.com`
- **Google SSO Admin**: `sid.bandewar@gmail.com`
- **Password**: Use the temp password from admin creation or create a new account

---

## 📊 **How to Access Your Data**

### **1. User Management**
**Access**: Admin Panel → User Management
**What you can see**:
- All registered users
- User creation dates
- Project counts per user
- Total spending per user
- User roles and status

**Actions available**:
- View user details
- Delete users (Super Admin only)
- Monitor user activity

### **2. Project Management**
**Access**: Admin Panel → Project Management
**What you can see**:
- All translation projects
- Project status (quote_generated, submitted, in_progress, review, completed)
- File names and word counts
- Cost breakdowns
- User information for each project

**Actions available**:
- Update project status
- Set ETA (Estimated Time of Arrival)
- Download original files
- Upload translated files
- Delete projects

### **3. File Storage**
**Local Development**:
```
./secure-files/          # Encrypted uploaded files
./uploads/               # Temporary upload storage
./translated/            # Completed translations
./data/verbiforge.db     # SQLite database
```

**Production (Render)**:
```
/opt/render/project/src/secure-files/    # Encrypted files
/opt/render/project/src/uploads/         # Temporary files
/opt/render/project/src/translated/      # Completed files
/opt/render/project/src/data/verbiforge.db # Database
```

### **4. Database Access**
**Direct Database Access**:
```bash
# Local development
sqlite3 ./data/verbiforge.db

# Production (via Render shell)
sqlite3 /opt/render/project/src/data/verbiforge.db
```

**Key Tables**:
```sql
-- View all users
SELECT * FROM users;

-- View all projects
SELECT * FROM projects;

-- View admin users
SELECT * FROM admin_users;

-- View contact submissions
SELECT * FROM contact_submissions;

-- View settings
SELECT * FROM settings;
```

---

## 🔧 **Diagnostic Tools**

### **1. Database Health Check**
```bash
# Check database health via API
curl https://verbiforge.onrender.com/api/health/database

# Run local diagnostics
node debug-database.js

# Fix Render database issues
node fix-render-database.js
```

### **2. Server Status**
```bash
# Basic health check
curl https://verbiforge.onrender.com/health

# Database status
curl https://verbiforge.onrender.com/db-status

# Detailed debugging
curl https://verbiforge.onrender.com/api/debug/database
```

### **3. File System Check**
```bash
# Check if files exist (local)
ls -la ./secure-files/
ls -la ./uploads/
ls -la ./translated/

# Check database file
ls -la ./data/verbiforge.db
```

---

## 📈 **Monitoring Your Project**

### **1. User Analytics**
**Access**: Admin Panel → User Management
**Metrics**:
- Total registered users
- Active users (with projects)
- User growth over time
- Average projects per user
- Total revenue per user

### **2. Project Analytics**
**Access**: Admin Panel → Project Management
**Metrics**:
- Total projects created
- Projects by status
- Average project value
- Most popular languages
- Project completion rates

### **3. Financial Analytics**
**Access**: Admin Panel → Project Management
**Metrics**:
- Total revenue
- Revenue by language
- Revenue by project type
- Average project cost
- Project management fee income

### **4. System Health**
**Access**: Various health endpoints
**Metrics**:
- Database size and health
- File storage usage
- Server response times
- Error rates
- Active connections

---

## 🛠️ **Common Operations**

### **1. Adding a New Admin**
```sql
-- Via database
INSERT INTO admin_users (email, name, temp_password, is_super_admin, created_by) 
VALUES ('newadmin@example.com', 'New Admin', 'temp123', FALSE, 'system');
```

### **2. Updating Project Status**
```sql
-- Via database
UPDATE projects SET status = 'completed' WHERE id = 'project-id';

-- Via admin panel
-- Go to Project Management → Click on project → Update Status
```

### **3. Changing Language Pricing**
```sql
-- Update settings table
UPDATE settings SET value = '{"English": 30, "Spanish": 40}' WHERE key = 'default_languages';
```

### **4. Backing Up Database**
```bash
# Local backup
cp ./data/verbiforge.db ./data/verbiforge.db.backup

# Production backup (via Render)
cp /opt/render/project/src/data/verbiforge.db /opt/render/project/src/data/verbiforge.db.backup
```

### **5. Restoring Database**
```bash
# Local restore
cp ./data/verbiforge.db.backup ./data/verbiforge.db

# Production restore (via Render)
cp /opt/render/project/src/data/verbiforge.db.backup /opt/render/project/src/data/verbiforge.db
```

---

## 🔐 **Security Best Practices**

### **1. Regular Password Changes**
- Change admin passwords regularly
- Use strong, unique passwords
- Enable "Remember Me" for convenience

### **2. File Security**
- All files are automatically encrypted
- Files are stored outside web root
- Access is restricted to authorized users only

### **3. Database Security**
- Regular backups
- Monitor for unusual activity
- Keep database file secure

### **4. Access Control**
- Limit admin access to trusted users
- Monitor admin actions
- Regular security audits

---

## 📞 **Troubleshooting**

### **1. Can't Access Admin Panel**
- Verify you're logged in as admin
- Check if your email is in admin_users table
- Try logging out and back in

### **2. Database Issues**
- Run `node debug-database.js`
- Check Render logs for errors
- Verify persistent disk is mounted

### **3. File Upload Problems**
- Check file size (max 10MB)
- Verify file type (.xlsx, .xls)
- Check secure-files directory permissions

### **4. Performance Issues**
- Monitor rate limiting
- Check database size
- Review server logs

---

## 🚀 **Quick Commands Reference**

```bash
# Start development server
npm start

# Check database health
node debug-database.js

# Fix production database
node fix-render-database.js

# View server logs (Render)
# Go to Render dashboard → Logs

# Access database directly
sqlite3 ./data/verbiforge.db

# Check file storage
ls -la ./secure-files/
ls -la ./uploads/
ls -la ./translated/

# Monitor API health
curl https://verbiforge.onrender.com/health
curl https://verbiforge.onrender.com/api/health/database
```

---

*This guide provides practical access to all aspects of your VerbiForge project. For detailed technical information, refer to PROJECT_OVERVIEW.md.*
