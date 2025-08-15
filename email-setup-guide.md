# 📧 VerbiForge Email Service Setup Guide

## 🚀 Step-by-Step Implementation

### **Step 1: Mailgun Account Setup**

1. **Go to [Mailgun.com](https://www.mailgun.com)**
2. **Sign up for a free account**
3. **Verify your email address**
4. **Add your domain** (or use their sandbox domain for testing)

### **Step 2: Get Mailgun Credentials**

1. **Go to Mailgun Dashboard**
2. **Navigate to Settings → API Keys**
3. **Copy your API Key** (starts with `key-`)
4. **Note your domain** (e.g., `mg.yourdomain.com` or sandbox domain)

### **Step 3: Environment Variables**

Add these to your `.env` file and Render environment variables:

```env
# Mailgun Configuration
MAILGUN_API_KEY=key-your-api-key-here
MAILGUN_DOMAIN=mg.yourdomain.com
FROM_EMAIL=noreply@yourdomain.com

# App Configuration
APP_URL=https://your-app-url.onrender.com
TEST_EMAIL=your-test-email@example.com
```

### **Step 4: Integration Points**

The email service is now ready to be integrated into your existing routes:

#### **A. Welcome Email (Signup Route)**
```javascript
// In your signup route
const EmailService = require('./email-service');
const emailService = new EmailService();

// After successful user creation
await emailService.sendWelcomeEmail(user.email, user.name);
```

#### **B. Project Creation Email**
```javascript
// In your project creation route
await emailService.sendProjectCreatedEmail(user.email, user.name, projectData);
```

#### **C. Project Completion Email**
```javascript
// In your file upload route (when project is completed)
await emailService.sendProjectCompletedEmail(user.email, user.name, projectData);
```

### **Step 5: Test the Email Service**

Add this test route to your server:

```javascript
// Test email service
app.post('/test-email', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const EmailService = require('./email-service');
        const emailService = new EmailService();
        
        const result = await emailService.testEmailService();
        
        if (result.success) {
            res.json({ success: true, message: 'Test email sent successfully' });
        } else {
            res.status(500).json({ error: 'Failed to send test email: ' + result.error });
        }
    } catch (error) {
        res.status(500).json({ error: 'Email service error: ' + error.message });
    }
});
```

## 📋 Email Templates Included

### **1. Welcome Email**
- ✅ Professional VerbiForge branding
- ✅ Welcome message with user's name
- ✅ Feature highlights
- ✅ Call-to-action button
- ✅ Support information

### **2. Project Creation Email**
- ✅ Project details table
- ✅ File information
- ✅ Word count and cost
- ✅ Next steps information
- ✅ Dashboard link

### **3. Project Completion Email**
- ✅ Completion celebration
- ✅ Project summary
- ✅ Download instructions
- ✅ Feedback request
- ✅ Download button

## 🔧 Configuration Options

### **Customization Points:**

1. **Email Templates:** Modify HTML in `email-service.js`
2. **Branding:** Update colors, logos, and styling
3. **Content:** Customize messages and call-to-actions
4. **Links:** Update `APP_URL` for your domain

### **Environment Variables:**

| Variable | Description | Example |
|----------|-------------|---------|
| `MAILGUN_API_KEY` | Your Mailgun API key | `key-abc123...` |
| `MAILGUN_DOMAIN` | Your Mailgun domain | `mg.yourdomain.com` |
| `FROM_EMAIL` | Sender email address | `noreply@yourdomain.com` |
| `APP_URL` | Your app's URL | `https://verbiforge.onrender.com` |
| `TEST_EMAIL` | Email for testing | `test@example.com` |

## 🚨 Important Notes

### **Security:**
- ✅ Never commit API keys to git
- ✅ Use environment variables
- ✅ Test in development first

### **Production Setup:**
- ✅ Verify your domain with Mailgun
- ✅ Set up proper DNS records
- ✅ Monitor email delivery rates
- ✅ Handle email failures gracefully

### **Cost Considerations:**
- ✅ Mailgun free tier: 10,000 emails/month
- ✅ Monitor usage in Mailgun dashboard
- ✅ Set up billing alerts

## 🧪 Testing

1. **Set up environment variables**
2. **Deploy to Render**
3. **Test with admin account**
4. **Check email delivery**
5. **Verify email templates**

## 📞 Support

If you encounter issues:
1. Check Mailgun dashboard for delivery status
2. Verify API key and domain settings
3. Check server logs for error messages
4. Test with the test email route

---

**Next Steps:** Integrate the email service into your existing routes and test thoroughly!
