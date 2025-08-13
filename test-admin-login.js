#!/usr/bin/env node

/**
 * Test Admin Login Script
 * 
 * This script tests admin user creation and password verification
 * to ensure the login system works correctly.
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

console.log('🧪 TESTING ADMIN LOGIN SYSTEM...');

// Determine database path
let dbDir;
if (process.env.NODE_ENV === 'production') {
    dbDir = '/opt/render/project/src/data';
} else {
    dbDir = path.join(__dirname, 'data');
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

// Test password hashing and verification
async function testPasswordSystem() {
    console.log('\n🔐 Testing password system...');
    
    const testPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(testPassword, 12);
    
    console.log('Original password:', testPassword);
    console.log('Hashed password:', hashedPassword);
    
    // Test verification
    const isValid = await bcrypt.compare(testPassword, hashedPassword);
    console.log('Password verification test:', isValid ? '✅ PASSED' : '❌ FAILED');
    
    return hashedPassword;
}

// Create test admin user
async function createTestAdmin(hashedPassword) {
    return new Promise((resolve, reject) => {
        const userId = uuidv4();
        const email = 'sid@verbiforge.com';
        const name = 'Super Admin';
        const role = 'super_admin';
        
        // First, check if user exists
        db.get('SELECT id, password_hash, role FROM users WHERE email = ?', [email], async (err, row) => {
            if (err) {
                console.error('❌ Error checking existing user:', err);
                reject(err);
                return;
            }
            
            if (row) {
                console.log('⚠️ User already exists, updating...');
                console.log('Current role:', row.role);
                console.log('Current password hash:', row.password_hash);
                
                // Update user
                db.run('UPDATE users SET password_hash = ?, role = ? WHERE email = ?', 
                    [hashedPassword, role, email], (err) => {
                    if (err) {
                        console.error('❌ Error updating user:', err);
                        reject(err);
                    } else {
                        console.log('✅ User updated successfully');
                        resolve();
                    }
                });
            } else {
                console.log('📝 Creating new admin user...');
                
                // Create new user
                db.run(`INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                    [userId, email, hashedPassword, name, role], (err) => {
                    if (err) {
                        console.error('❌ Error creating user:', err);
                        reject(err);
                    } else {
                        console.log('✅ User created successfully');
                        resolve();
                    }
                });
            }
        });
    });
}

// Test login verification
async function testLoginVerification() {
    return new Promise((resolve, reject) => {
        const email = 'sid@verbiforge.com';
        const password = 'admin123';
        
        console.log('\n🔍 Testing login verification...');
        console.log('Email:', email);
        console.log('Password:', password);
        
        // Find user
        db.get('SELECT id, email, password_hash, name, role FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('❌ Error finding user:', err);
                reject(err);
                return;
            }
            
            if (!user) {
                console.error('❌ User not found in database');
                reject(new Error('User not found'));
                return;
            }
            
            console.log('✅ User found in database:');
            console.log('  ID:', user.id);
            console.log('  Email:', user.email);
            console.log('  Name:', user.name);
            console.log('  Role:', user.role);
            console.log('  Password hash:', user.password_hash);
            
            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            console.log('Password verification:', isValidPassword ? '✅ VALID' : '❌ INVALID');
            
            if (isValidPassword) {
                console.log('\n🎉 LOGIN TEST PASSED!');
                console.log('You should be able to login with:');
                console.log('  Email: sid@verbiforge.com');
                console.log('  Password: admin123');
            } else {
                console.log('\n❌ LOGIN TEST FAILED!');
                console.log('Password verification failed');
            }
            
            resolve();
        });
    });
}

// Show all users in database
function showAllUsers() {
    return new Promise((resolve, reject) => {
        console.log('\n👥 All users in database:');
        db.all('SELECT id, email, name, role, created_at FROM users ORDER BY created_at', (err, rows) => {
            if (err) {
                console.error('❌ Error fetching users:', err);
                reject(err);
                return;
            }
            
            if (rows.length === 0) {
                console.log('  No users found');
            } else {
                rows.forEach((row, index) => {
                    console.log(`  ${index + 1}. ${row.email} (${row.role}) - ${row.name}`);
                });
            }
            
            resolve();
        });
    });
}

// Main function
async function main() {
    try {
        // Test password system
        const hashedPassword = await testPasswordSystem();
        
        // Create/update admin user
        await createTestAdmin(hashedPassword);
        
        // Show all users
        await showAllUsers();
        
        // Test login verification
        await testLoginVerification();
        
        console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Close database
        db.close((err) => {
            if (err) {
                console.error('❌ Error closing database:', err);
            } else {
                console.log('✅ Database closed successfully');
            }
            process.exit(0);
        });
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

// Run the test
main();
