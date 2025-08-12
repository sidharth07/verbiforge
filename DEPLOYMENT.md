# 🚀 VerbiForge Deployment Guide - Render Free Tier

## 📋 Prerequisites
- GitHub account
- Render account (free tier)
- Your project code pushed to GitHub

## 🔧 Step-by-Step Deployment

### 1. Prepare Your Repository
```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit - Production ready VerbiForge"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/verbiforge.git
git push -u origin main
```

### 2. Deploy to Render

#### Option A: Using Render Dashboard (Recommended)
1. **Go to [render.com](https://render.com)** and sign up/login
2. **Click "New +"** → **"Web Service"**
3. **Connect your GitHub repository**
4. **Configure the service:**
   - **Name**: `verbiforge`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

#### Option B: Using render.yaml (Blue-Green Deployment)
1. **Push your code** with the `render.yaml` file
2. **Go to Render Dashboard**
3. **Click "New +"** → **"Blueprint"**
4. **Connect your repository**
5. **Render will automatically configure everything**

### 3. Environment Variables
Set these in Render Dashboard → Environment:

```
NODE_ENV=production
PORT=10000
JWT_SECRET=your-super-secure-jwt-secret-here
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
```

### 4. Free Tier Limitations
- **512 MB RAM**
- **0.1 CPU**
- **750 hours/month** (spins down after 15 minutes of inactivity)
- **100 GB bandwidth/month**

## 🔒 Security Checklist
- ✅ JWT_SECRET is set and secure
- ✅ NODE_ENV=production
- ✅ Rate limiting enabled
- ✅ File size limits configured
- ✅ CORS properly configured

## 🌐 Custom Domain (Optional)
1. **Go to your Render service**
2. **Settings** → **Custom Domains**
3. **Add your domain** (e.g., `verbiforge.com`)
4. **Update DNS** as instructed

## 📊 Monitoring
- **Logs**: Available in Render Dashboard
- **Metrics**: Basic metrics included
- **Uptime**: 99.9% SLA on paid plans

## 🚨 Important Notes
- **Free tier spins down** after 15 minutes of inactivity
- **First request** after inactivity may take 30-60 seconds
- **Database** is SQLite (file-based) - consider PostgreSQL for production
- **File storage** is local - consider cloud storage for production

## 🔄 Updates
```bash
# Make changes locally
git add .
git commit -m "Update description"
git push origin main

# Render automatically redeploys
```

## 🆘 Troubleshooting
- **Build fails**: Check logs in Render Dashboard
- **App crashes**: Check environment variables
- **Database issues**: Ensure data directory is writable
- **File upload fails**: Check MAX_FILE_SIZE setting

## 📞 Support
- **Render Docs**: https://render.com/docs
- **Render Support**: Available in dashboard
- **Community**: Render Discord/Forums

---
**Your VerbiForge is now production-ready! 🎉**
