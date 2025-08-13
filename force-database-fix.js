#!/usr/bin/env node

/**
 * Force Database Fix Script
 * 
 * This script aggressively ensures the SQLite database is correctly created
 * and initialized in Render's persistent disk location. It will:
 * 1. Force the database path to the correct Render location
 * 2. Remove any existing database in wrong locations
 * 3. Create a fresh database with all necessary tables
 * 4. Insert default admin users
 * 5. Verify the database is working correctly
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

console.log('🔧 FORCE DATABASE FIX SCRIPT STARTING...');
console.log('🔧 Environment:', process.env.NODE_ENV);
console.log('🔧 Current working directory:', process.cwd());
console.log('🔧 __dirname:', __dirname);

// Force the correct database path
let dbDir;
if (process.env.NODE_ENV === 'production') {
    // ALWAYS use Render persistent disk in production
    dbDir = '/opt/render/project/src/data';
    console.log('🌐 PRODUCTION: Forcing Render persistent disk path:', dbDir);
} else {
    dbDir = path.join(__dirname, 'data');
    console.log('🔧 DEVELOPMENT: Using local data directory:', dbDir);
}

const dbPath = path.join(dbDir, 'verbiforge.db');
console.log('🎯 TARGET DATABASE PATH:', dbPath);

// Step 1: Ensure directory exists
console.log('\n📁 STEP 1: Ensuring directory exists...');
if (!fs.existsSync(dbDir)) {
    console.log(`📁 Creating directory: ${dbDir}`);
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
    console.log('✅ Directory created successfully');
} else {
    console.log('✅ Directory already exists');
    
    // Check permissions
    try {
        fs.accessSync(dbDir, fs.constants.W_OK);
        console.log('✅ Directory is writable');
    } catch (error) {
        console.log('⚠️ Directory not writable, fixing permissions...');
        fs.chmodSync(dbDir, 0o755);
        console.log('✅ Permissions fixed');
    }
}

// Step 2: Remove any existing database to start fresh
console.log('\n🗑️ STEP 2: Removing existing database...');
if (fs.existsSync(dbPath)) {
    console.log('🗑️ Removing existing database file...');
    fs.unlinkSync(dbPath);
    console.log('✅ Existing database removed');
} else {
    console.log('✅ No existing database found');
}

// Step 3: Create fresh database
console.log('\n🗄️ STEP 3: Creating fresh database...');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error creating database:', err);
        process.exit(1);
    }
    console.log('✅ Database created successfully');
});

// Step 4: Initialize tables
console.log('\n📋 STEP 4: Creating database tables...');

// Users table
db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    google_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('❌ Error creating users table:', err);
    } else {
        console.log('✅ Users table created');
    }
});

// Admin users table
db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    temp_password TEXT,
    is_super_admin BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL
)`, (err) => {
    if (err) {
        console.error('❌ Error creating admin_users table:', err);
    } else {
        console.log('✅ Admin users table created');
    }
});

// Projects table
db.run(`CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT,
    translated_file_path TEXT,
    translated_file_name TEXT,
    project_type TEXT DEFAULT 'fusion',
    multiplier REAL DEFAULT 1,
    word_count INTEGER NOT NULL,
    breakdown TEXT NOT NULL,
    subtotal REAL NOT NULL,
    project_management_cost REAL DEFAULT 500,
    total REAL NOT NULL,
    status TEXT DEFAULT 'quote_generated',
    eta INTEGER,
    notes TEXT,
    submitted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('❌ Error creating projects table:', err);
    } else {
        console.log('✅ Projects table created');
    }
});

// Contact submissions table
db.run(`CREATE TABLE IF NOT EXISTS contact_submissions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('❌ Error creating contact_submissions table:', err);
    } else {
        console.log('✅ Contact submissions table created');
    }
});

// Settings table
db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) {
        console.error('❌ Error creating settings table:', err);
    } else {
        console.log('✅ Settings table created');
    }
});

// Step 5: Insert default admin users
console.log('\n👤 STEP 5: Creating default admin users...');

// Default super admin
db.run(`INSERT OR IGNORE INTO admin_users (email, name, temp_password, is_super_admin, created_by) 
        VALUES ('sid@verbiforge.com', 'Super Admin', 'admin123', TRUE, 'system')`, (err) => {
    if (err) {
        console.error('❌ Error creating super admin:', err);
    } else {
        console.log('✅ Super admin created: sid@verbiforge.com');
    }
});

// Google SSO admin
db.run(`INSERT OR IGNORE INTO admin_users (email, name, temp_password, is_super_admin, created_by) 
        VALUES ('sid.bandewar@gmail.com', 'Sid Bandewar (Google SSO)', 'admin123', FALSE, 'system')`, (err) => {
    if (err) {
        console.error('❌ Error creating Google SSO admin:', err);
    } else {
        console.log('✅ Google SSO admin created: sid.bandewar@gmail.com');
    }
});

// Step 6: Insert default settings
console.log('\n⚙️ STEP 6: Creating default settings...');

const defaultLanguages = {
    "English": 25,
    "Spanish": 35,
    "French": 35,
    "German": 45,
    "Portuguese": 35,
    "Italian": 35,
    "Dutch": 40,
    "Russian": 40,
    "Chinese": 35,
    "Japanese": 35,
    "Korean": 40,
    "Arabic": 50,
    "Hindi": 35,
    "Bengali": 40,
    "Urdu": 40,
    "Turkish": 40,
    "Polish": 40,
    "Czech": 40,
    "Hungarian": 40,
    "Swedish": 40,
    "Norwegian": 40,
    "Danish": 40,
    "Finnish": 45,
    "Greek": 40,
    "Hebrew": 30,
    "Thai": 40,
    "Vietnamese": 40,
    "Indonesian": 35,
    "Malay": 35,
    "Filipino": 35,
    "Swahili": 45
};

db.run(`INSERT OR IGNORE INTO settings (key, value, description) 
        VALUES ('default_languages', ?, 'Default language pricing per 100 words')`, 
        [JSON.stringify(defaultLanguages)], (err) => {
    if (err) {
        console.error('❌ Error creating default languages setting:', err);
    } else {
        console.log('✅ Default languages setting created');
    }
});

// Step 7: Verify database integrity
console.log('\n🔍 STEP 7: Verifying database integrity...');

// Check if tables exist
const tables = ['users', 'admin_users', 'projects', 'contact_submissions', 'settings'];
let tablesVerified = 0;

tables.forEach(table => {
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table], (err, row) => {
        if (err) {
            console.error(`❌ Error checking table ${table}:`, err);
        } else if (row) {
            console.log(`✅ Table ${table} exists`);
            tablesVerified++;
        } else {
            console.error(`❌ Table ${table} does not exist`);
        }
        
        // Check admin users count
        if (table === 'admin_users') {
            db.get('SELECT COUNT(*) as count FROM admin_users', (err, result) => {
                if (err) {
                    console.error('❌ Error counting admin users:', err);
                } else {
                    console.log(`✅ Admin users count: ${result.count}`);
                }
            });
        }
        
        // Final verification
        if (tablesVerified === tables.length) {
            console.log('\n🎉 DATABASE VERIFICATION COMPLETE!');
            
            // Check file size
            const stats = fs.statSync(dbPath);
            const sizeInMB = stats.size / (1024 * 1024);
            console.log(`📊 Database file size: ${sizeInMB.toFixed(2)} MB`);
            console.log(`📊 Database file path: ${dbPath}`);
            console.log(`📊 Database file exists: ${fs.existsSync(dbPath)}`);
            
            // Test database connection
            db.get('SELECT COUNT(*) as count FROM admin_users', (err, result) => {
                if (err) {
                    console.error('❌ Final database test failed:', err);
                } else {
                    console.log(`✅ Final database test passed: ${result.count} admin users found`);
                    console.log('\n🎉 FORCE DATABASE FIX COMPLETED SUCCESSFULLY!');
                    console.log('🎉 Your database should now persist across deployments!');
                    
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
            });
        }
    });
});

// Handle any errors
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
