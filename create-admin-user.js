#!/usr/bin/env node

/**
 * Create Admin User Script
 * 
 * This script creates proper admin users in the users table
 * with bcrypt password hashing for login authentication.
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

console.log('👤 CREATING ADMIN USER SCRIPT STARTING...');

// Determine database path
let dbDir;
if (process.env.NODE_ENV === 'production') {
    dbDir = '/opt/render/project/src/data';
    console.log('🌐 PRODUCTION: Using Render persistent disk path:', dbDir);
} else {
    dbDir = path.join(__dirname, 'data');
    console.log('🔧 DEVELOPMENT: Using local data directory:', dbDir);
}

const dbPath = path.join(dbDir, 'verbiforge.db');
console.log('🎯 Database path:', dbPath);

// Check if database exists
if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file does not exist:', dbPath);
    console.log('💡 Please run the server first to create the database');
    process.exit(1);
}

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Connected to database successfully');
});

// Function to create admin user
async function createAdminUser(email, name, password, isSuperAdmin = false) {
    return new Promise((resolve, reject) => {
        // Check if user already exists
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
            if (err) {
                console.error('❌ Error checking existing user:', err);
                reject(err);
                return;
            }
            
            if (row) {
                console.log(`⚠️ User ${email} already exists, updating password...`);
                
                // Update existing user's password
                const hashedPassword = await bcrypt.hash(password, 12);
                db.run('UPDATE users SET password_hash = ?, role = ? WHERE email = ?', 
                    [hashedPassword, isSuperAdmin ? 'super_admin' : 'admin', email], (err) => {
                    if (err) {
                        console.error('❌ Error updating user:', err);
                        reject(err);
                    } else {
                        console.log(`✅ Updated user ${email} with new password`);
                        resolve();
                    }
                });
            } else {
                // Create new user
                const userId = uuidv4();
                const hashedPassword = await bcrypt.hash(password, 12);
                const role = isSuperAdmin ? 'super_admin' : 'admin';
                
                db.run(`INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                    [userId, email, hashedPassword, name, role], (err) => {
                    if (err) {
                        console.error('❌ Error creating user:', err);
                        reject(err);
                    } else {
                        console.log(`✅ Created admin user: ${email}`);
                        console.log(`   - Name: ${name}`);
                        console.log(`   - Role: ${role}`);
                        console.log(`   - Password: ${password}`);
                        resolve();
                    }
                });
            }
        });
    });
}

// Main function
async function main() {
    try {
        console.log('\n👤 Creating admin users...');
        
        // Create super admin
        await createAdminUser(
            'sid@verbiforge.com',
            'Super Admin',
            'admin123',
            true
        );
        
        // Create Google SSO admin
        await createAdminUser(
            'sid.bandewar@gmail.com',
            'Sid Bandewar (Google SSO)',
            'admin123',
            false
        );
        
        console.log('\n🎉 ADMIN USERS CREATED SUCCESSFULLY!');
        console.log('\n📋 Login Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Super Admin:');
        console.log('  Email: sid@verbiforge.com');
        console.log('  Password: admin123');
        console.log('  Role: super_admin');
        console.log('');
        console.log('Google SSO Admin:');
        console.log('  Email: sid.bandewar@gmail.com');
        console.log('  Password: admin123');
        console.log('  Role: admin');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n🌐 Login URL: https://verbiforge.onrender.com/login.html');
        console.log('🔧 Admin Panel: https://verbiforge.onrender.com/admin.html');
        
        // Verify users were created
        console.log('\n🔍 Verifying created users...');
        db.all('SELECT email, name, role FROM users WHERE role IN ("admin", "super_admin")', (err, rows) => {
            if (err) {
                console.error('❌ Error verifying users:', err);
            } else {
                console.log('✅ Admin users in database:');
                rows.forEach(row => {
                    console.log(`   - ${row.email} (${row.role})`);
                });
            }
            
            // Close database
            db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err);
                } else {
                    console.log('✅ Database closed successfully');
                }
                process.exit(0);
            });
        });
        
    } catch (error) {
        console.error('❌ Error creating admin users:', error);
        db.close();
        process.exit(1);
    }
}

// Handle errors
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Run the script
main();
