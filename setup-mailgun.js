#!/usr/bin/env node

/**
 * Mailgun Setup Script for VerbiForge
 * This script helps you configure Mailgun environment variables
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 VerbiForge Mailgun Setup');
console.log('============================\n');

console.log('📋 Prerequisites:');
console.log('1. Mailgun account created at https://www.mailgun.com');
console.log('2. Domain added to Mailgun (e.g., mg.verbiforge.com)');
console.log('3. API key obtained from Mailgun dashboard');
console.log('4. DNS records configured for your domain\n');

// Get user input
const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function setupMailgun() {
    try {
        console.log('🔧 Configuration Setup:\n');
        
        const apiKey = await askQuestion('Enter your Mailgun API key (starts with "key-"): ');
        const domain = await askQuestion('Enter your Mailgun domain (e.g., mg.verbiforge.com): ');
        const fromEmail = await askQuestion('Enter your sender email (e.g., noreply@verbiforge.com): ');
        const testEmail = await askQuestion('Enter your test email address: ');
        
        console.log('\n📝 Updating render.yaml...');
        
        // Read current render.yaml
        const renderYamlPath = path.join(__dirname, 'render.yaml');
        let renderYaml = fs.readFileSync(renderYamlPath, 'utf8');
        
        // Update environment variables
        renderYaml = renderYaml.replace(
            /MAILGUN_API_KEY.*value: "".*# Add your Mailgun API key here/,
            `MAILGUN_API_KEY\n        value: "${apiKey}"  # Your Mailgun API key`
        );
        
        renderYaml = renderYaml.replace(
            /MAILGUN_DOMAIN.*value: "".*# Add your Mailgun domain here/,
            `MAILGUN_DOMAIN\n        value: "${domain}"  # Your Mailgun domain`
        );
        
        renderYaml = renderYaml.replace(
            /FROM_EMAIL.*value: "noreply@verbiforge.com".*# Update with your domain/,
            `FROM_EMAIL\n        value: "${fromEmail}"  # Your sender email address`
        );
        
        renderYaml = renderYaml.replace(
            /TEST_EMAIL.*value: "".*# Add your test email address here/,
            `TEST_EMAIL\n        value: "${testEmail}"  # Your test email address`
        );
        
        // Write updated render.yaml
        fs.writeFileSync(renderYamlPath, renderYaml);
        
        console.log('✅ render.yaml updated successfully!');
        
        console.log('\n📋 Next Steps:');
        console.log('1. Commit and push your changes:');
        console.log('   git add .');
        console.log('   git commit -m "Configure Mailgun environment variables"');
        console.log('   git push origin master');
        console.log('');
        console.log('2. Wait for deployment to complete on Render.com');
        console.log('');
        console.log('3. Test the email service:');
        console.log('   - Sign up a new user to test welcome email');
        console.log('   - Create a project to test project creation email');
        console.log('   - Upload a translated file to test completion email');
        console.log('');
        console.log('4. Check server logs for email delivery status');
        
        console.log('\n🔍 Troubleshooting:');
        console.log('- If emails still fail, check your Mailgun dashboard for domain verification');
        console.log('- Ensure DNS records are properly configured');
        console.log('- Verify API key is correct and active');
        console.log('- Check Mailgun logs for delivery status');
        
    } catch (error) {
        console.error('❌ Error during setup:', error.message);
    } finally {
        rl.close();
    }
}

// Run the setup
setupMailgun();
