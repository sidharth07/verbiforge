# VerbiForge Project Overview

## 🎯 **Project Summary**

**VerbiForge** is a professional translation project management platform that allows users to:
- Upload Excel files for translation
- Get instant cost quotes in multiple languages
- Manage translation projects
- Track project status and progress
- Handle secure file storage and delivery

---

## 🏗️ **Architecture Overview**

### **Technology Stack**
- **Backend**: Node.js with Express.js
- **Database**: SQLite3 with persistent storage
- **Authentication**: JWT tokens with bcrypt password hashing
- **File Handling**: Multer for uploads, custom encryption/decryption
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Hosting**: Render.com with persistent disk storage
- **Security**: Helmet.js, rate limiting, input validation

### **Project Structure**
```
Kiro/
├── server-secure.js          # Main server file
├── database.js              # Database management
├── auth.js                  # Authentication logic
├── fileManager.js           # File handling & encryption
├── public/                  # Frontend files
│   ├── index.html          # Landing page
│   ├── login.html          # Login page
│   ├── signup.html         # Signup page
│   ├── dashboard.html      # User dashboard
│   ├── admin.html          # Admin panel
│   └── client-auth.js      # Client-side auth helper
├── data/                   # Database storage (local)
├── secure-files/           # Encrypted file storage
├── render.yaml             # Render deployment config
└── package.json            # Dependencies
```

---

## 👥 **User Management System**

### **User Types**

#### **1. Regular Users**
- **Registration**: Email, password, name
- **Permissions**: Create projects, view own projects, submit files
- **Access**: Dashboard, project management
- **Token Expiry**: 24 hours (normal) / 30 days (remember me)

#### **2. Admin Users**
- **Creation**: Pre-defined in database or via admin signup
- **Permissions**: All user permissions + admin panel access
- **Access**: Admin panel, user management, project oversight
- **Admin Emails**:
  - `sid@verbiforge.com` (Super Admin)
  - `sid.bandewar@gmail.com` (Google SSO Admin)

#### **3. Super Admins**
- **Permissions**: All admin permissions + user deletion, admin management
- **Special Access**: Can delete users, manage other admins

### **Authentication Flow**
1. **Login/Signup** → JWT token generated
2. **Token Storage** → localStorage (client-side)
3. **API Requests** → Bearer token in Authorization header
4. **Token Validation** → Server-side verification on each request
5. **Auto-logout** → Token expiry or 401/403 responses

### **Database Tables**
```sql
-- Users table
users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    google_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)

-- Admin users table
admin_users (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    temp_password TEXT,
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL
)
```

---

## 📁 **File Management System**

### **File Storage Locations**

#### **1. Local Development**
- **Database**: `./data/verbiforge.db`
- **Files**: `./secure-files/`
- **Uploads**: `./uploads/`
- **Translations**: `./translated/`

#### **2. Production (Render)**
- **Database**: `/opt/render/project/src/data/verbiforge.db`
- **Files**: `/opt/render/project/src/secure-files/`
- **Uploads**: `/opt/render/project/src/uploads/`
- **Translations**: `/opt/render/project/src/translated/`

### **File Processing Flow**

#### **1. File Upload**
```
User Upload → Multer (memory) → Validation → Encryption → Secure Storage
```

#### **2. File Analysis**
```
Encrypted File → Decryption → Excel Processing → Text Extraction → Word Count
```

#### **3. File Delivery**
```
Translation Complete → Encryption → Secure Storage → Download Link
```

### **File Security Features**
- **Encryption**: AES-256 encryption for all files
- **Temporary Storage**: Files stored in memory during processing
- **Secure Paths**: Files stored outside web root
- **Access Control**: Files only accessible to authorized users
- **Automatic Cleanup**: Temporary files removed after processing

### **Supported File Types**
- **Input**: `.xlsx`, `.xls` (Excel files)
- **Output**: Encrypted files with download links
- **Size Limit**: 10MB per file

---

## 💰 **Pricing & Cost Calculation**

### **Language Pricing (per 100 words)**
```json
{
  "English": 25,
  "Spanish": 35,
  "French": 35,
  "German": 45,
  "Portuguese": 35,
  "Italian": 35,
  "Dutch": 40,
  "Russian": 40,
  "Chinese": 35,
  "Japanese": 35,
  "Korean": 40,
  "Arabic": 50,
  "Hindi": 35,
  "Bengali": 40,
  "Urdu": 40,
  "Turkish": 40,
  "Polish": 40,
  "Czech": 40,
  "Hungarian": 40,
  "Swedish": 40,
  "Norwegian": 40,
  "Danish": 40,
  "Finnish": 45,
  "Greek": 40,
  "Hebrew": 30,
  "Thai": 40,
  "Vietnamese": 40,
  "Indonesian": 35,
  "Malay": 35,
  "Filipino": 35,
  "Swahili": 45
}
```

### **Project Types**
1. **Fusion (Standard)**: Base rate × 1.0
2. **Pure (Premium)**: Base rate × 1.5

### **Additional Costs**
- **Project Management**: $500 (fixed)
- **Per Language**: Calculated based on word count and language rate

### **Cost Calculation Example**
```
File: 1000 words
Languages: English, Spanish, French
Project Type: Pure (1.5x multiplier)

English: 1000 × $0.25 × 1.5 = $375
Spanish: 1000 × $0.35 × 1.5 = $525
French: 1000 × $0.35 × 1.5 = $525
Subtotal: $1,425
Project Management: $500
Total: $1,925
```

---

## 📊 **Project Management System**

### **Project Lifecycle**
1. **Quote Generated** → Initial cost calculation
2. **Submitted** → User confirms and pays
3. **In Progress** → Translation work begins
4. **Review** → Quality check and finalization
5. **Completed** → Files delivered to user

### **Project Data Structure**
```sql
projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT,
    translated_file_path TEXT,
    translated_file_name TEXT,
    project_type TEXT DEFAULT 'fusion',
    multiplier REAL DEFAULT 1,
    word_count INTEGER NOT NULL,
    breakdown TEXT NOT NULL,
    subtotal REAL NOT NULL,
    project_management_cost REAL DEFAULT 500,
    total REAL NOT NULL,
    status TEXT DEFAULT 'quote_generated',
    eta INTEGER,
    notes TEXT,
    submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### **Status Tracking**
- **quote_generated**: Initial quote created
- **submitted**: User has submitted the project
- **in_progress**: Translation work in progress
- **review**: Quality review phase
- **completed**: Project finished and delivered

---

## 🔐 **Security Features**

### **Authentication & Authorization**
- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Role-Based Access**: User, Admin, Super Admin levels
- **Session Management**: Token expiry and auto-logout

### **API Security**
- **Rate Limiting**: 300 requests/15min (general), 50 requests/15min (auth)
- **Input Validation**: Express-validator for all inputs
- **CORS Protection**: Configured for production domains
- **Security Headers**: Helmet.js implementation

### **File Security**
- **Encryption**: AES-256 for all stored files
- **Secure Storage**: Files outside web root
- **Access Control**: User-specific file access
- **Temporary Processing**: Files in memory only during processing

### **Database Security**
- **SQL Injection Protection**: Parameterized queries
- **Data Validation**: Input sanitization
- **Access Control**: User-specific data access
- **Backup System**: Automatic database backups

---

## 🌐 **Deployment & Hosting**

### **Render.com Configuration**
- **Service Type**: Web Service
- **Environment**: Node.js
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Persistent Disk**: 1GB mounted at `/opt/render/project/src/data`

### **Environment Variables**
```yaml
NODE_ENV: production
PORT: 10000
JWT_SECRET: [auto-generated]
FILE_ENCRYPTION_KEY: [auto-generated]
SESSION_SECRET: [auto-generated]
DATABASE_PATH: /opt/render/project/src/data
DATABASE_URL: /opt/render/project/src/data/verbiforge.db
RATE_LIMIT_WINDOW_MS: 900000
RATE_LIMIT_MAX_REQUESTS: 100
MAX_FILE_SIZE: 10485760
ALLOWED_FILE_TYPES: .xlsx,.xls
DEFAULT_SUPER_ADMIN_EMAIL: sid@verbiforge.com
DEFAULT_SUPER_ADMIN_NAME: Super Admin
GOOGLE_SSO_ADMIN_EMAIL: sid.bandewar@gmail.com
GOOGLE_SSO_ADMIN_NAME: Sid Bandewar (Google SSO)
```

### **Domain & SSL**
- **Custom Domain**: verbiforge.onrender.com
- **SSL**: Automatic HTTPS via Render
- **DNS**: Configured for custom domain support

---

## 📈 **Monitoring & Analytics**

### **Health Check Endpoints**
- `/health` - Basic server status
- `/db-status` - Database health and statistics
- `/api/health/database` - Detailed database diagnostics
- `/api/debug/database` - Comprehensive debugging info

### **Logging**
- **Server Logs**: Comprehensive startup and operation logs
- **Database Logs**: Connection, initialization, and error logs
- **File Operations**: Upload, processing, and delivery logs
- **Authentication**: Login attempts and security events

### **Performance Metrics**
- **Response Times**: API endpoint performance
- **File Processing**: Upload and analysis times
- **Database Operations**: Query performance and connection stats
- **Error Rates**: Failed requests and system errors

---

## 🔧 **Development & Maintenance**

### **Local Development**
```bash
# Install dependencies
npm install

# Start development server
npm start

# Run database diagnostics
node debug-database.js

# Fix database issues
node fix-render-database.js
```

### **Database Management**
- **Backup**: Automatic backups before major operations
- **Migrations**: Schema updates via migration system
- **Health Checks**: Regular database integrity verification
- **Recovery**: Backup restoration capabilities

### **File Management**
- **Cleanup**: Automatic temporary file removal
- **Encryption**: Secure file storage and retrieval
- **Access Control**: User-specific file permissions
- **Backup**: Critical file backup procedures

---

## 🚀 **Future Enhancements**

### **Planned Features**
- **Google SSO**: OAuth integration (currently disabled)
- **Email Notifications**: Project status updates
- **Payment Integration**: Stripe/PayPal integration
- **API Documentation**: Swagger/OpenAPI specs
- **Mobile App**: React Native mobile application

### **Scalability Improvements**
- **Database Migration**: PostgreSQL for better performance
- **File Storage**: AWS S3 or similar cloud storage
- **Caching**: Redis for improved response times
- **Load Balancing**: Multiple server instances

### **Security Enhancements**
- **Two-Factor Authentication**: TOTP implementation
- **Audit Logging**: Comprehensive activity tracking
- **Advanced Encryption**: End-to-end encryption
- **Penetration Testing**: Regular security assessments

---

## 📞 **Support & Contact**

### **Admin Access**
- **Primary Admin**: sid@verbiforge.com
- **Google SSO Admin**: sid.bandewar@gmail.com
- **Admin Panel**: Access via `/admin.html` after login

### **Technical Support**
- **Database Issues**: Use diagnostic scripts
- **File Problems**: Check secure-files directory
- **Authentication**: Verify JWT token validity
- **Deployment**: Monitor Render logs

### **User Support**
- **Contact Form**: Available on contact page
- **Help Documentation**: In-app guidance
- **Error Reporting**: Automatic error logging
- **Feedback System**: User feedback collection

---

## 📋 **Quick Reference**

### **Important URLs**
- **Production**: https://verbiforge.onrender.com
- **Admin Panel**: https://verbiforge.onrender.com/admin.html
- **User Dashboard**: https://verbiforge.onrender.com/dashboard.html

### **Key Commands**
```bash
# Start server
npm start

# Database diagnostics
node debug-database.js

# Fix Render database
node fix-render-database.js

# Check database health
curl https://verbiforge.onrender.com/api/health/database
```

### **Critical Files**
- **Server**: `server-secure.js`
- **Database**: `database.js`
- **Auth**: `auth.js`
- **Files**: `fileManager.js`
- **Config**: `render.yaml`

---

*This document provides a comprehensive overview of the VerbiForge project. For specific technical details, refer to the individual source files.*
