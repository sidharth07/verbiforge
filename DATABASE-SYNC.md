# Database Sync Setup for VerbiForge

This document explains how to set up automatic database synchronization between your production and staging environments in Neon.

## 🎯 **Problem Solved**

- **Separate Databases**: Production and staging remain separate for security
- **Automatic Sync**: Staging database automatically gets updated with production data
- **Testing Accuracy**: Test features with real production data (anonymized)
- **Data Consistency**: Ensure staging reflects production state

## 🚀 **Setup Instructions**

### **Step 1: Environment Variables**

Add these environment variables to your GitHub repository secrets:

```bash
# Production Database (Neon Production Branch)
PRODUCTION_DATABASE_URL=postgresql://user:password@ep-prod-xxx.us-east-1.aws.neon.tech/verbiforge?sslmode=require

# Staging Database (Neon Development Branch)  
STAGING_DATABASE_URL=postgresql://user:password@ep-dev-xxx.us-east-1.aws.neon.tech/verbiforge?sslmode=require
```

### **Step 2: GitHub Secrets Setup**

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add these repository secrets:
   - `PRODUCTION_DATABASE_URL`
   - `STAGING_DATABASE_URL`

### **Step 3: Manual Testing**

Test the sync locally first:

```bash
# Install dependencies
npm install

# Set environment variables locally
export PRODUCTION_DATABASE_URL="your-production-url"
export STAGING_DATABASE_URL="your-staging-url"

# Run manual sync
npm run sync-db
```

## 📊 **How It Works**

### **Automated Sync Process**

1. **Daily Schedule**: Runs every day at 2 AM UTC
2. **Manual Trigger**: Can be triggered manually from GitHub Actions
3. **Data Anonymization**: Sensitive data is anonymized for staging
4. **Complete Sync**: All tables are synced in dependency order
5. **Logging**: Detailed logs saved for each sync operation

### **Tables Synced**

- `users` (email anonymized)
- `user_relationships`
- `projects`
- `files`
- `translations`
- `email_templates`
- `settings`
- `contacts` (messages anonymized)

### **Data Anonymization**

- **Emails**: `user@domain.com` → `user+staging@domain.com`
- **Messages**: Contact form messages → `[STAGING DATA - ANONYMIZED]`
- **Passwords**: Kept for testing (hashed)

## 🛠 **Usage Commands**

```bash
# Manual sync (recommended for testing)
npm run sync-db

# Direct sync (advanced)
npm run sync-db-manual

# Check sync logs
ls -la sync-logs/
```

## 📝 **Sync Logs**

Each sync operation creates a detailed log file in `sync-logs/`:

```json
{
  "timestamp": "2024-01-15T02:00:00.000Z",
  "totalTables": 8,
  "totalRows": 1250,
  "tables": [
    {
      "table": "users",
      "rows": 150,
      "timestamp": "2024-01-15T02:00:05.000Z"
    }
  ]
}
```

## 🔧 **Customization**

### **Change Sync Frequency**

Edit `.github/workflows/database-sync.yml`:

```yaml
schedule:
  # Every 6 hours
  - cron: '0 */6 * * *'
  
  # Every Monday at 3 AM
  - cron: '0 3 * * 1'
```

### **Add More Tables**

Edit `database-sync.js`:

```javascript
const TABLES_TO_SYNC = [
    'users',
    'user_relationships',
    'projects',
    'files',
    'translations',
    'email_templates',
    'settings',
    'contacts',
    'new_table' // Add here
];
```

### **Modify Anonymization**

Edit `database-sync.js`:

```javascript
const SENSITIVE_FIELDS = {
    users: ['email', 'password_hash', 'phone'], // Add phone
    contacts: ['email', 'message', 'name']      // Add name
};
```

## 🚨 **Important Notes**

### **Security Considerations**

- ✅ **Data Anonymization**: Sensitive data is anonymized
- ✅ **Separate Databases**: Production and staging remain isolated
- ✅ **Read-Only Access**: Staging sync only reads from production
- ✅ **Secure Credentials**: Database URLs stored as GitHub secrets

### **Performance Impact**

- **Minimal**: Sync runs during low-traffic hours (2 AM UTC)
- **Efficient**: Only changed data is transferred
- **Non-Blocking**: Production database remains unaffected

### **Monitoring**

- **GitHub Actions**: Monitor sync status in Actions tab
- **Logs**: Check sync logs for detailed information
- **Alerts**: Set up notifications for sync failures

## 🎉 **Benefits**

1. **Accurate Testing**: Test with real production data
2. **Feature Validation**: Ensure features work with actual data
3. **Data Consistency**: Staging always reflects production state
4. **Automated Process**: No manual intervention required
5. **Security**: Sensitive data is properly anonymized

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Connection Failed**: Check database URLs in secrets
2. **Permission Denied**: Verify database user permissions
3. **Sync Failed**: Check sync logs for detailed error messages
4. **Missing Tables**: Ensure all tables exist in both databases

### **Debug Commands**

```bash
# Test database connections
node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.PRODUCTION_DATABASE_URL });
client.connect().then(() => console.log('✅ Production connected')).catch(console.error);
"
```

## 📞 **Support**

If you encounter issues:

1. Check the sync logs in `sync-logs/`
2. Review GitHub Actions logs
3. Verify environment variables
4. Test database connections manually

---

**Last Updated**: January 2024
**Version**: 1.0.0
