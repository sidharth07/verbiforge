const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

class EmailService {
    constructor() {
        this.apiKey = process.env.MAILGUN_API_KEY;
        this.domain = process.env.MAILGUN_DOMAIN;
        this.fromEmail = process.env.FROM_EMAIL || 'noreply@verbiforge.com';
        
        // Check if Mailgun is properly configured
        this.isConfigured = this.apiKey && this.domain && this.apiKey !== 'your-mailgun-api-key';
        
        if (this.isConfigured) {
            this.mg = mailgun.client({
                username: 'api',
                key: this.apiKey,
            });
            console.log('📧 Mailgun email service configured successfully');
        } else {
            console.warn('⚠️ Mailgun not configured - emails will be logged but not sent');
            console.warn('⚠️ Set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables');
            // Don't initialize mailgun client if not configured to prevent 401 errors
        }
    }

    // Send welcome email when user signs up
    async sendWelcomeEmail(userEmail, userName) {
        try {
            const messageData = {
                from: `VerbiForge <${this.fromEmail}>`,
                to: userEmail,
                subject: 'Welcome to VerbiForge! 🚀',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to VerbiForge!</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Professional Translation Services</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi ${userName}! 👋</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Thank you for joining VerbiForge! We're excited to help you with your translation projects.
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">What you can do now:</h3>
                                <ul style="color: #666; line-height: 1.8;">
                                    <li>📁 Upload your documents for translation</li>
                                    <li>🌍 Choose from 100+ languages</li>
                                    <li>💰 Get instant pricing quotes</li>
                                    <li>📊 Track your project progress</li>
                                    <li>📥 Download completed translations</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.APP_URL || 'https://verbiforge.onrender.com'}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    Get Started with Your First Project
                                </a>
                            </div>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                If you have any questions, feel free to reach out to our support team. We're here to help!
                            </p>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Best regards,<br>
                                The VerbiForge Team
                            </p>
                        </div>
                    </div>
                `
            };

            if (!this.isConfigured) {
                console.log('📧 [MAILGUN NOT CONFIGURED] Welcome email would be sent to:', userEmail);
                console.log('📧 Email subject:', messageData.subject);
                return { success: true, messageId: 'not-configured', message: 'Email logged but not sent - Mailgun not configured' };
            }

            if (!this.mg) {
                console.log('📧 [MAILGUN CLIENT NOT INITIALIZED] Welcome email would be sent to:', userEmail);
                return { success: true, messageId: 'not-initialized', message: 'Email logged but not sent - Mailgun client not initialized' };
            }

            const response = await this.mg.messages.create(this.domain, messageData);
            console.log('✅ Welcome email sent successfully:', response);
            return { success: true, messageId: response.id };
            
        } catch (error) {
            console.error('❌ Error sending welcome email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send project creation email
    async sendProjectCreatedEmail(userEmail, userName, projectData) {
        try {
            const messageData = {
                from: `VerbiForge <${this.fromEmail}>`,
                to: userEmail,
                subject: `Project Created: ${projectData.name} 📋`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Project Created Successfully!</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your translation project is ready</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi ${userName}! 🎉</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Your translation project has been created successfully. Here are the details:
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Details:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">File:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.fileName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.wordCount.toLocaleString()} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.projectType}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Cost:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">$${projectData.total}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
                                <h4 style="color: #1976d2; margin-top: 0;">Next Steps:</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    Your project is now in our queue. Our team will review it and begin the translation process. 
                                    You'll receive updates as your project progresses.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.APP_URL || 'https://verbiforge.onrender.com'}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    View Project Dashboard
                                </a>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Thank you for choosing VerbiForge!<br>
                                We'll keep you updated on your project's progress.
                            </p>
                        </div>
                    </div>
                `
            };

            if (!this.isConfigured) {
                console.log('📧 [MAILGUN NOT CONFIGURED] Project creation email would be sent to:', userEmail);
                console.log('📧 Email subject:', messageData.subject);
                return { success: true, messageId: 'not-configured', message: 'Email logged but not sent - Mailgun not configured' };
            }

            if (!this.mg) {
                console.log('📧 [MAILGUN CLIENT NOT INITIALIZED] Project creation email would be sent to:', userEmail);
                return { success: true, messageId: 'not-initialized', message: 'Email logged but not sent - Mailgun client not initialized' };
            }

            const response = await this.mg.messages.create(this.domain, messageData);
            console.log('✅ Project creation email sent successfully:', response);
            return { success: true, messageId: response.id };
            
        } catch (error) {
            console.error('❌ Error sending project creation email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send project completion email
    async sendProjectCompletedEmail(userEmail, userName, projectData) {
        try {
            const messageData = {
                from: `VerbiForge <${this.fromEmail}>`,
                to: userEmail,
                subject: `Project Completed: ${projectData.name} ✅`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Project Completed! 🎉</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your translation is ready for download</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi ${userName}! 🚀</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Great news! Your translation project has been completed successfully. Your files are ready for download.
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Summary:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.name}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Original File:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.fileName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Translated File:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">${projectData.translatedFileName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.wordCount.toLocaleString()} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.projectType}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                                <h4 style="color: #155724; margin-top: 0;">Ready for Download! 📥</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    Your translated file is now available in your dashboard. You can download it anytime.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.APP_URL || 'https://verbiforge.onrender.com'}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    Download Your Translation
                                </a>
                            </div>
                            
                            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                <h4 style="color: #856404; margin-top: 0;">We'd Love Your Feedback! ⭐</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    How was your experience with VerbiForge? We'd appreciate your feedback to help us improve our services.
                                </p>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Thank you for choosing VerbiForge!<br>
                                We hope to work with you again soon.
                            </p>
                        </div>
                    </div>
                `
            };

            if (!this.isConfigured) {
                console.log('📧 [MAILGUN NOT CONFIGURED] Project completion email would be sent to:', userEmail);
                console.log('📧 Email subject:', messageData.subject);
                return { success: true, messageId: 'not-configured', message: 'Email logged but not sent - Mailgun not configured' };
            }

            if (!this.mg) {
                console.log('📧 [MAILGUN CLIENT NOT INITIALIZED] Project completion email would be sent to:', userEmail);
                return { success: true, messageId: 'not-initialized', message: 'Email logged but not sent - Mailgun client not initialized' };
            }

            const response = await this.mg.messages.create(this.domain, messageData);
            console.log('✅ Project completion email sent successfully:', response);
            return { success: true, messageId: response.id };
            
        } catch (error) {
            console.error('❌ Error sending project completion email:', error);
            return { success: false, error: error.message };
        }
    }

    // Send project creation notification to super admin
    async sendProjectCreatedNotificationToAdmin(projectData) {
        try {
            const adminEmail = 'sid@verbiforge.com';
            const messageData = {
                from: `VerbiForge <${this.fromEmail}>`,
                to: adminEmail,
                subject: `New Project Alert!`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">New Project Alert! 🚨</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">A new project has been created</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Project Details 📊</h2>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Information:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.projectName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project ID:</td>
                                        <td style="padding: 8px 0; color: #333; font-family: monospace;">${projectData.projectId}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">File:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.fileName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.wordCount.toLocaleString()} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.projectType}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Cost:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">$${projectData.total}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
                                <h4 style="color: #1976d2; margin-top: 0;">Client Information:</h4>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Name:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.userName}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                        <td style="padding: 8px 0; color: #333;">${projectData.userEmail}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            ${projectData.breakdown && projectData.breakdown.length > 0 ? `
                            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                <h4 style="color: #856404; margin-top: 0;">Language Breakdown:</h4>
                                <table style="width: 100%; border-collapse: collapse;">
                                    ${projectData.breakdown.map(item => `
                                        <tr>
                                            <td style="padding: 8px 0; color: #666; font-weight: bold;">${item.language}:</td>
                                            <td style="padding: 8px 0; color: #333;">$${item.cost}</td>
                                        </tr>
                                    `).join('')}
                                </table>
                            </div>
                            ` : ''}
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${process.env.APP_URL || 'https://verbiforge.onrender.com'}/admin.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    View Project in Admin Panel
                                </a>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                This is an automated notification from VerbiForge.<br>
                                You can manage this project from the Admin Panel.
                            </p>
                        </div>
                    </div>
                `
            };

            if (!this.isConfigured) {
                console.log('📧 [MAILGUN NOT CONFIGURED] Admin notification would be sent to:', adminEmail);
                console.log('📧 Email subject:', messageData.subject);
                return { success: true, messageId: 'not-configured', message: 'Email logged but not sent - Mailgun not configured' };
            }

            if (!this.mg) {
                console.log('📧 [MAILGUN CLIENT NOT INITIALIZED] Admin notification would be sent to:', adminEmail);
                return { success: true, messageId: 'not-initialized', message: 'Email logged but not sent - Mailgun client not initialized' };
            }

            const response = await this.mg.messages.create(this.domain, messageData);
            console.log('✅ Admin notification sent successfully:', response);
            return { success: true, messageId: response.id };
            
        } catch (error) {
            console.error('❌ Error sending admin notification:', error);
            return { success: false, error: error.message };
        }
    }

    // Test email service
    async testEmailService() {
        try {
            const testEmail = process.env.TEST_EMAIL || 'test@example.com';
            const messageData = {
                from: `VerbiForge <${this.fromEmail}>`,
                to: testEmail,
                subject: 'VerbiForge Email Service Test',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #333;">Email Service Test</h1>
                        <p style="color: #666;">This is a test email to verify that your VerbiForge email service is working correctly.</p>
                        <p style="color: #28a745; font-weight: bold;">✅ Email service is configured and working!</p>
                    </div>
                `
            };

            if (!this.isConfigured) {
                console.log('📧 [MAILGUN NOT CONFIGURED] Test email would be sent to:', testEmail);
                console.log('📧 Email subject:', messageData.subject);
                return { 
                    success: false, 
                    error: 'Mailgun not configured. Please set MAILGUN_API_KEY and MAILGUN_DOMAIN environment variables.',
                    message: 'Email logged but not sent - Mailgun not configured'
                };
            }

            if (!this.mg) {
                console.log('📧 [MAILGUN CLIENT NOT INITIALIZED] Test email would be sent to:', testEmail);
                return { 
                    success: false, 
                    error: 'Mailgun client not initialized. Please check configuration.',
                    message: 'Email logged but not sent - Mailgun client not initialized'
                };
            }

            const response = await this.mg.messages.create(this.domain, messageData);
            console.log('✅ Test email sent successfully:', response);
            return { success: true, messageId: response.id };
            
        } catch (error) {
            console.error('❌ Error sending test email:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = EmailService;
