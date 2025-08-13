# Railway Deployment Guide

## Overview
This guide will help you deploy your VerbiForge application on Railway.app.

## Prerequisites
- Railway account (free trial available)
- GitHub repository with your code
- Domain name (optional, Railway provides subdomain)

## Step 1: Prepare Your Repository

### 1. Ensure these files are in your repository:
- `server-secure.js` (main server file)
- `package.json` (with correct start script)
- `railway.json` (Railway configuration)
- All other project files

### 2. Verify your package.json has:
```json
{
  "scripts": {
    "start": "node server-secure.js"
  }
}
```

## Step 2: Deploy to Railway

### 1. Connect GitHub Repository:
1. Go to [Railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `verbiforge` repository
5. Click "Deploy Now"

### 2. Railway will automatically:
- Detect it's a Node.js project
- Install dependencies from `package.json`
- Start the application using the start script
- Provide a public URL

## Step 3: Configure Environment Variables

### 1. In Railway Dashboard:
1. Go to your project
2. Click on your service
3. Go to "Variables" tab
4. Add these environment variables:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-here
FILE_ENCRYPTION_KEY=your-file-encryption-key-here
SESSION_SECRET=your-session-secret-here
DATABASE_PATH=/tmp
DATABASE_URL=/tmp/verbiforge.db
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls
DEFAULT_SUPER_ADMIN_EMAIL=sid@verbiforge.com
DEFAULT_SUPER_ADMIN_NAME=Super Admin
GOOGLE_SSO_ADMIN_EMAIL=sid.bandewar@gmail.com
GOOGLE_SSO_ADMIN_NAME=Sid Bandewar (Google SSO)
```

### 2. Generate Secure Keys:
You can generate secure random keys using:
```bash
# JWT Secret
openssl rand -hex 32

# File Encryption Key
openssl rand -hex 32

# Session Secret
openssl rand -hex 32
```

## Step 4: Database Configuration

### Important: Railway uses ephemeral storage
- Files in `/tmp` are temporary and will be lost on restarts
- For production, consider using Railway's PostgreSQL plugin

### Option 1: Use SQLite (for testing)
- Database will reset on each deployment
- Good for development/testing

### Option 2: Use PostgreSQL (recommended for production)
1. In Railway dashboard, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically connect it to your app
4. Update your code to use PostgreSQL instead of SQLite

## Step 5: Custom Domain (Optional)

### 1. Add Custom Domain:
1. In Railway dashboard, go to "Settings"
2. Click "Domains"
3. Add your custom domain
4. Update DNS records as instructed

### 2. SSL Certificate:
- Railway automatically provides SSL certificates
- No additional configuration needed

## Step 6: Google OAuth Setup (Optional)

### 1. Update OAuth Callback URL:
In your Google Cloud Console, update the callback URL to:
```
https://your-railway-domain.railway.app/auth/google/callback
```

### 2. Add OAuth Environment Variables:
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-railway-domain.railway.app/auth/google/callback
```

### 3. Re-enable Google OAuth:
Uncomment the OAuth code in `server-secure.js` and redeploy.

## Step 7: Monitor and Debug

### 1. View Logs:
- In Railway dashboard, click on your service
- Go to "Deployments" tab
- Click on latest deployment
- View logs for any errors

### 2. Health Check:
- Your app has a `/health` endpoint
- Railway will use this for health checks
- Access: `https://your-app.railway.app/health`

### 3. Common Issues:

#### Issue: Application not starting
**Solution**: Check logs for missing environment variables or dependencies

#### Issue: Database errors
**Solution**: Ensure DATABASE_PATH is set to `/tmp` for Railway

#### Issue: File uploads not working
**Solution**: Railway has file size limits, check MAX_FILE_SIZE setting

## Step 8: Scaling and Performance

### 1. Railway Plans:
- **Free Trial**: 500 hours/month, 512MB RAM
- **Pro**: $5/month, 1GB RAM, unlimited deployments
- **Team**: $20/month, shared resources

### 2. Performance Tips:
- Use Railway's PostgreSQL for persistent data
- Optimize file uploads for Railway's limits
- Monitor resource usage in dashboard

## Step 9: Backup and Migration

### 1. Database Backup:
If using SQLite, download database file before redeployments:
```bash
# Download from Railway (if possible)
railway connect
# Copy database file
```

### 2. Environment Variables:
- Export all environment variables
- Keep them in a secure location
- Use Railway's variable management

## Troubleshooting

### Common Railway Issues:

1. **Build Failures**:
   - Check `package.json` has correct start script
   - Verify all dependencies are in `dependencies` (not `devDependencies`)
   - Check logs for specific error messages

2. **Runtime Errors**:
   - Check environment variables are set correctly
   - Verify database path is `/tmp` for Railway
   - Check file permissions

3. **Deployment Issues**:
   - Ensure `railway.json` is in root directory
   - Check health check endpoint is working
   - Verify port is set to `process.env.PORT`

## Cost and Limits

### Free Trial Limits:
- 500 hours/month
- 512MB RAM
- 1GB storage
- Shared CPU

### Pro Plan ($5/month):
- Unlimited hours
- 1GB RAM
- 10GB storage
- Dedicated CPU

## Support

- **Railway Documentation**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **GitHub Issues**: For code-specific issues

## Next Steps

1. Deploy to Railway using this guide
2. Test all functionality
3. Set up custom domain (optional)
4. Configure Google OAuth (optional)
5. Monitor performance and logs
6. Consider upgrading to Pro plan for production use
