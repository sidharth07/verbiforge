# Hostinger Deployment Guide

## Overview
This guide will help you deploy your VerbiForge application on Hostinger VPS/Cloud hosting.

## Prerequisites
- Hostinger VPS or Cloud hosting plan
- Domain name
- SSH access to your server
- Basic command line knowledge

## Step 1: Choose Your Hosting Plan

### Recommended Plans:
1. **VPS Hosting** (Recommended)
   - Starting at $3.95/month
   - Full root access
   - Node.js support
   - Better performance

2. **Cloud Hosting**
   - Starting at $9.99/month
   - Managed environment
   - Node.js support
   - Less technical setup

## Step 2: Server Setup

### For VPS Hosting:

1. **Connect to your server via SSH:**
   ```bash
   ssh root@your-server-ip
   ```

2. **Update system packages:**
   ```bash
   apt update && apt upgrade -y
   ```

3. **Install Node.js:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   apt-get install -y nodejs
   ```

4. **Install PM2 (Process Manager):**
   ```bash
   npm install -g pm2
   ```

5. **Install Nginx (Web Server):**
   ```bash
   apt install nginx -y
   ```

6. **Install Git:**
   ```bash
   apt install git -y
   ```

## Step 3: Application Deployment

### 1. Clone Your Repository:
```bash
cd /var/www
git clone https://github.com/sidharth07/verbiforge.git
cd verbiforge
```

### 2. Install Dependencies:
```bash
npm install
```

### 3. Create Environment File:
```bash
nano .env
```

Add your environment variables:
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secret-jwt-key
FILE_ENCRYPTION_KEY=your-file-encryption-key
SESSION_SECRET=your-session-secret
DATABASE_PATH=/var/www/verbiforge/data
DATABASE_URL=/var/www/verbiforge/data/verbiforge.db
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls
DEFAULT_SUPER_ADMIN_EMAIL=sid@verbiforge.com
DEFAULT_SUPER_ADMIN_NAME=Super Admin
GOOGLE_SSO_ADMIN_EMAIL=sid.bandewar@gmail.com
GOOGLE_SSO_ADMIN_NAME=Sid Bandewar (Google SSO)
```

### 4. Create Data Directory:
```bash
mkdir -p /var/www/verbiforge/data
chmod 755 /var/www/verbiforge/data
```

### 5. Start Application with PM2:
```bash
pm2 start server-secure.js --name "verbiforge"
pm2 save
pm2 startup
```

## Step 4: Nginx Configuration

### 1. Create Nginx Configuration:
```bash
nano /etc/nginx/sites-available/verbiforge
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase file upload size
    client_max_body_size 10M;
}
```

### 2. Enable the Site:
```bash
ln -s /etc/nginx/sites-available/verbiforge /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Step 5: SSL Certificate (HTTPS)

### 1. Install Certbot:
```bash
apt install certbot python3-certbot-nginx -y
```

### 2. Get SSL Certificate:
```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 3. Auto-renewal:
```bash
crontab -e
```
Add this line:
```
0 12 * * * /usr/bin/certbot renew --quiet
```

## Step 6: Database Migration

### 1. Update Database Path:
The application will automatically create the database in `/var/www/verbiforge/data/verbiforge.db`

### 2. Initialize Database:
```bash
cd /var/www/verbiforge
node test-database.js
```

### 3. Add Admin User (if needed):
```bash
npm run add-admin
```

## Step 7: File Permissions

### 1. Set Proper Permissions:
```bash
chown -R www-data:www-data /var/www/verbiforge
chmod -R 755 /var/www/verbiforge
chmod -R 777 /var/www/verbiforge/data
chmod -R 777 /var/www/verbiforge/secure-files
```

## Step 8: Firewall Configuration

### 1. Configure UFW:
```bash
ufw allow ssh
ufw allow 'Nginx Full'
ufw enable
```

## Step 9: Monitoring and Maintenance

### 1. Check Application Status:
```bash
pm2 status
pm2 logs verbiforge
```

### 2. Monitor System Resources:
```bash
htop
df -h
```

### 3. Backup Database:
```bash
cp /var/www/verbiforge/data/verbiforge.db /var/www/verbiforge/data/verbiforge_backup_$(date +%Y%m%d).db
```

## Step 10: Google OAuth Setup (Optional)

### 1. Update OAuth Callback URL:
In your Google Cloud Console, update the callback URL to:
```
https://your-domain.com/auth/google/callback
```

### 2. Update Environment Variables:
```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback
```

### 3. Re-enable Google OAuth:
Uncomment the OAuth code in `server-secure.js` and restart:
```bash
pm2 restart verbiforge
```

## Troubleshooting

### Common Issues:

1. **Application Not Starting:**
   ```bash
   pm2 logs verbiforge
   cd /var/www/verbiforge && node server-secure.js
   ```

2. **Database Permission Issues:**
   ```bash
   chmod 777 /var/www/verbiforge/data
   chown www-data:www-data /var/www/verbiforge/data
   ```

3. **Nginx Configuration Errors:**
   ```bash
   nginx -t
   systemctl status nginx
   ```

4. **SSL Certificate Issues:**
   ```bash
   certbot certificates
   certbot renew --dry-run
   ```

## Security Considerations

1. **Change Default SSH Port**
2. **Use SSH Keys Instead of Passwords**
3. **Regular Security Updates**
4. **Database Backups**
5. **Monitor Logs Regularly**

## Cost Breakdown

- **Domain**: $10-15/year
- **VPS Hosting**: $3.95-15/month
- **SSL Certificate**: Free (Let's Encrypt)
- **Total**: ~$57-195/year

## Support

- **Hostinger Support**: 24/7 live chat
- **Documentation**: Hostinger knowledge base
- **Community**: Stack Overflow, Reddit
