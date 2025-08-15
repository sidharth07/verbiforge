# 🚀 Mailgun Email Setup Guide for VerbiForge

This guide will help you set up Mailgun for sending automated emails from your VerbiForge application.

## 📋 Prerequisites

- ✅ Domain name purchased (e.g., verbiforge.com)
- ✅ Email hosting service configured
- ✅ VerbiForge application deployed on Render.com

## 🔧 Step 1: Mailgun Account Setup

### 1.1 Create Mailgun Account
1. **Go to [Mailgun.com](https://www.mailgun.com)**
2. **Click "Sign Up"** and create a free account
3. **Verify your email address**

### 1.2 Add Your Domain
1. **Login to Mailgun Dashboard**
2. **Click "Add New Domain"**
3. **Enter your domain** (e.g., `verbiforge.com`)
4. **Choose "Custom Domain"** (not sandbox)
5. **Click "Add Domain"**

### 1.3 Domain Verification
Mailgun will provide DNS records to add to your domain:

**Add these DNS records to your domain provider:**

| Type | Name | Value |
|------|------|-------|
| TXT | @ | v=spf1 include:mailgun.org ~all |
| CNAME | email | mxa.mailgun.org |
| CNAME | email | mxb.mailgun.org |
| TXT | k1._domainkey | k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC... |
| TXT | k2._domainkey | k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC... |

**Wait 24-48 hours** for DNS propagation.

## 🔑 Step 2: Get Mailgun Credentials

### 2.1 API Key
1. **Go to Mailgun Dashboard**
2. **Click "Settings" → "API Keys"**
3. **Copy your Private API Key** (starts with `key-`)

### 2.2 Domain Information
1. **Go to "Domains"**
2. **Click on your domain**
3. **Note your domain name** (e.g., `mg.verbiforge.com`)

## ⚙️ Step 3: Configure Environment Variables

### 3.1 Update render.yaml
Update the environment variables in your `render.yaml` file:

```yaml
envVars:
  - key: MAILGUN_API_KEY
    value: "key-your-actual-api-key-here"
  - key: MAILGUN_DOMAIN
    value: "mg.verbiforge.com"  # Your Mailgun domain
  - key: FROM_EMAIL
    value: "noreply@verbiforge.com"  # Your sending email
  - key: APP_URL
    value: "https://verbiforge.onrender.com"
  - key: TEST_EMAIL
    value: "your-test-email@gmail.com"  # For testing
```

### 3.2 Or Set in Render Dashboard
1. **Go to your Render.com dashboard**
2. **Click on your VerbiForge service**
3. **Go to "Environment" tab**
4. **Add these variables:**

| Variable | Value | Description |
|----------|-------|-------------|
| `MAILGUN_API_KEY` | `key-your-api-key` | Your Mailgun API key |
| `MAILGUN_DOMAIN` | `mg.verbiforge.com` | Your Mailgun domain |
| `FROM_EMAIL` | `noreply@verbiforge.com` | Sender email address |
| `APP_URL` | `https://verbiforge.onrender.com` | Your app URL |
| `TEST_EMAIL` | `your-email@gmail.com` | Test email address |

## 🧪 Step 4: Test Email Service

### 4.1 Deploy Changes
1. **Commit and push your changes**
2. **Wait for deployment to complete**

### 4.2 Test via Admin Panel
1. **Login to your admin account**
2. **Go to Admin Panel**
3. **Use the test email feature** (if available)

### 4.3 Test via API
```bash
curl -X POST https://verbiforge.onrender.com/test-email \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

## 📧 Step 5: Email Types Configured

Your VerbiForge application now sends these automated emails:

### 5.1 Welcome Email
- **Trigger**: User signs up
- **Content**: Welcome message, features overview, getting started guide

### 5.2 Project Creation Email
- **Trigger**: User creates a new project
- **Content**: Project details, cost breakdown, next steps

### 5.3 Project Completion Email
- **Trigger**: Admin uploads translated file
- **Content**: Completion notification, download instructions, feedback request

## 🔍 Step 6: Monitor Email Delivery

### 6.1 Mailgun Dashboard
1. **Go to Mailgun Dashboard**
2. **Click "Logs"** to see email delivery status
3. **Monitor delivery rates** and bounces

### 6.2 Email Analytics
- **Delivery Rate**: Should be >95%
- **Bounce Rate**: Should be <5%
- **Spam Complaints**: Should be <0.1%

## 🚨 Troubleshooting

### Common Issues:

#### 1. DNS Not Propagated
**Problem**: Emails not sending, DNS errors
**Solution**: Wait 24-48 hours for DNS propagation

#### 2. API Key Invalid
**Problem**: "Unauthorized" errors
**Solution**: Check API key in environment variables

#### 3. Domain Not Verified
**Problem**: "Domain not found" errors
**Solution**: Verify domain in Mailgun dashboard

#### 4. Sending Limits
**Problem**: "Quota exceeded" errors
**Solution**: Check Mailgun usage limits (10,000 emails/month free)

### Debug Steps:
1. **Check server logs** for email errors
2. **Verify environment variables** are set correctly
3. **Test with Mailgun's API directly**
4. **Check domain DNS records**

## 📊 Mailgun Free Tier Limits

- **10,000 emails per month**
- **5 authorized recipients**
- **Custom domains supported**
- **API access included**

## 🔒 Security Best Practices

1. **Never commit API keys** to version control
2. **Use environment variables** for sensitive data
3. **Monitor email logs** regularly
4. **Set up SPF/DKIM** records for better deliverability
5. **Use dedicated sending domain** (not sandbox)

## ✅ Success Checklist

- [ ] Mailgun account created
- [ ] Domain added and verified
- [ ] DNS records configured
- [ ] API key obtained
- [ ] Environment variables set
- [ ] Application deployed
- [ ] Test email sent successfully
- [ ] Welcome email working
- [ ] Project emails working
- [ ] Email logs monitored

## 🆘 Support

If you encounter issues:

1. **Check Mailgun documentation**: https://documentation.mailgun.com/
2. **Review server logs** for error messages
3. **Test with Mailgun's API directly**
4. **Contact Mailgun support** if needed

---

**🎉 Congratulations!** Your VerbiForge application now has professional email notifications set up!
