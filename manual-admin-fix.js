#!/usr/bin/env node

/**
 * Manual Admin Fix Script
 * 
 * Run this script manually on Render to create admin users
 * when the deployment fails or admin users are missing.
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

console.log('🔧 MANUAL ADMIN FIX SCRIPT');
console.log('========================');

// Force production path
const dbPath = '/opt/render/project/src/data/verbiforge.db';
console.log('🎯 Database path:', dbPath);

// Check if database exists
if (!fs.existsSync(dbPath)) {
    console.error('❌ Database file does not exist!');
    console.log('💡 Please ensure the server has started at least once');
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

// Create admin user function
async function createAdminUser(email, name, password, isSuperAdmin = false) {
    return new Promise((resolve, reject) => {
        const userId = uuidv4();
        const role = isSuperAdmin ? 'super_admin' : 'admin';
        
        // Hash password
        bcrypt.hash(password, 12).then(hashedPassword => {
            // Check if user exists
            db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
                if (err) {
                    console.error('❌ Error checking user:', err);
                    reject(err);
                    return;
                }
                
                if (row) {
                    // Update existing user
                    db.run('UPDATE users SET password_hash = ?, role = ?, name = ? WHERE email = ?', 
                        [hashedPassword, role, name, email], (err) => {
                        if (err) {
                            console.error('❌ Error updating user:', err);
                            reject(err);
                        } else {
                            console.log(`✅ Updated admin user: ${email}`);
                            resolve();
                        }
                    });
                } else {
                    // Create new user
                    db.run(`INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) 
                            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                        [userId, email, hashedPassword, name, role], (err) => {
                        if (err) {
                            console.error('❌ Error creating user:', err);
                            reject(err);
                        } else {
                            console.log(`✅ Created admin user: ${email}`);
                            resolve();
                        }
                    });
                }
            });
        }).catch(err => {
            console.error('❌ Error hashing password:', err);
            reject(err);
        });
    });
}

// Main function
async function main() {
    try {
        console.log('\n👤 Creating admin users...');
        
        // Create super admin
        await createAdminUser('sid@verbiforge.com', 'Super Admin', 'admin123', true);
        
        // Create Google SSO admin
        await createAdminUser('sid.bandewar@gmail.com', 'Sid Bandewar (Google SSO)', 'admin123', false);
        
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
        
        // Verify users
        console.log('\n🔍 Verifying users...');
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

// Run the script
main();
