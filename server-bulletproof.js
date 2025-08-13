require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 BULLETPROOF VerbiForge server starting...');
console.log('  - Environment:', process.env.NODE_ENV);
console.log('  - Port:', PORT);
console.log('  - Current directory:', process.cwd());

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup - FORCE the correct path
let dbDir;
if (process.env.NODE_ENV === 'production') {
    dbDir = '/opt/render/project/src/data';
    console.log('🌐 PRODUCTION: Using Render persistent disk');
} else {
    dbDir = path.join(__dirname, 'data');
    console.log('🔧 DEVELOPMENT: Using local data directory');
}

const dbPath = path.join(dbDir, 'verbiforge.db');
console.log('🎯 Database path:', dbPath);

// FORCE create directory
try {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
        console.log('📁 Created database directory:', dbDir);
    } else {
        console.log('📁 Database directory exists:', dbDir);
    }
} catch (error) {
    console.error('❌ Error creating directory:', error);
    process.exit(1);
}

// Connect to database
let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Error opening database:', err);
            process.exit(1);
        }
        console.log('✅ Connected to database successfully');
    });
} catch (error) {
    console.error('❌ Error creating database connection:', error);
    process.exit(1);
}

// Create tables and admin users
function setupDatabase() {
    return new Promise((resolve, reject) => {
        console.log('🗄️ Setting up database...');
        
        // Create users table
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        db.run(createTableSQL, (err) => {
            if (err) {
                console.error('❌ Error creating users table:', err);
                reject(err);
                return;
            }
            console.log('✅ Users table created/verified');
            
            // Create admin users
            createAdminUsers().then(resolve).catch(reject);
        });
    });
}

// Create admin users with proper password hashing
async function createAdminUsers() {
    console.log('👤 Creating admin users...');
    
    const adminUsers = [
        { email: 'sid@verbiforge.com', name: 'Super Admin', password: 'admin123', isSuperAdmin: true },
        { email: 'sid.bandewar@gmail.com', name: 'Sid Bandewar (Google SSO)', password: 'admin123', isSuperAdmin: false }
    ];
    
    for (const admin of adminUsers) {
        await createAdminUser(admin.email, admin.name, admin.password, admin.isSuperAdmin);
    }
    
    console.log('🎉 All admin users created successfully!');
}

// Create single admin user
function createAdminUser(email, name, password, isSuperAdmin = false) {
    return new Promise((resolve, reject) => {
        const role = isSuperAdmin ? 'super_admin' : 'admin';
        
        // Check if user exists
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
            if (err) {
                console.error(`❌ Error checking user ${email}:`, err);
                reject(err);
                return;
            }
            
            if (row) {
                console.log(`✅ Admin user ${email} already exists`);
                resolve();
            } else {
                try {
                    // Create new admin user
                    const userId = uuidv4();
                    const hashedPassword = await bcrypt.hash(password, 12);
                    
                    const insertSQL = `
                        INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    `;
                    
                    db.run(insertSQL, [userId, email, hashedPassword, name, role], (err) => {
                        if (err) {
                            console.error(`❌ Error creating admin user ${email}:`, err);
                            reject(err);
                        } else {
                            console.log(`✅ Created admin user: ${email} (${role})`);
                            resolve();
                        }
                    });
                } catch (error) {
                    console.error(`❌ Error hashing password for ${email}:`, error);
                    reject(error);
                }
            }
        });
    });
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: dbPath,
        environment: process.env.NODE_ENV,
        message: 'Bulletproof server is running!'
    });
});

// Emergency admin creation endpoint
app.post('/api/create-admin', async (req, res) => {
    try {
        console.log('🔧 Emergency admin creation requested');
        
        await createAdminUsers();
        
        res.json({
            success: true,
            message: 'Admin users created successfully',
            credentials: {
                super_admin: {
                    email: 'sid@verbiforge.com',
                    password: 'admin123',
                    role: 'super_admin'
                },
                admin: {
                    email: 'sid.bandewar@gmail.com',
                    password: 'admin123',
                    role: 'admin'
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error in emergency admin creation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test admin endpoint
app.get('/api/test-admin', (req, res) => {
    db.all('SELECT email, name, role FROM users WHERE role IN ("admin", "super_admin")', (err, rows) => {
        if (err) {
            console.error('❌ Error fetching admin users:', err);
            res.status(500).json({ error: err.message });
        } else {
            console.log('📋 Admin users found:', rows);
            res.json({
                admin_users: rows,
                count: rows.length
            });
        }
    });
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🔐 Login attempt for:', email);
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        // Find user
        db.get('SELECT id, email, password_hash, name, role FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('❌ Database error during login:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                console.log('❌ User not found:', email);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            console.log('✅ User found:', user.email, 'Role:', user.role);
            
            // Verify password
            try {
                const isValidPassword = await bcrypt.compare(password, user.password_hash);
                
                if (!isValidPassword) {
                    console.log('❌ Invalid password for:', email);
                    return res.status(401).json({ error: 'Invalid credentials' });
                }
                
                console.log(`✅ Successful login: ${email} (${user.role})`);
                
                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        role: user.role
                    },
                    message: 'Login successful'
                });
                
            } catch (bcryptError) {
                console.error('❌ Bcrypt error:', bcryptError);
                res.status(500).json({ error: 'Password verification error' });
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test password endpoint
app.post('/api/test-password', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        db.get('SELECT password_hash FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            const isValid = await bcrypt.compare(password, user.password_hash);
            
            res.json({
                email: email,
                password_provided: password,
                password_hash: user.password_hash,
                is_valid: isValid
            });
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
async function startServer() {
    try {
        console.log('🚀 Starting bulletproof server...');
        
        // Setup database and create admin users
        await setupDatabase();
        
        // Start the server
        app.listen(PORT, '0.0.0.0', () => {
            console.log('🎉 BULLETPROOF SERVER STARTED SUCCESSFULLY!');
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/health`);
            console.log('');
            console.log('📋 ADMIN CREDENTIALS:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Super Admin:');
            console.log('  Email: sid@verbiforge.com');
            console.log('  Password: admin123');
            console.log('  Role: super_admin');
            console.log('');
            console.log('Admin:');
            console.log('  Email: sid.bandewar@gmail.com');
            console.log('  Password: admin123');
            console.log('  Role: admin');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('');
            console.log('🔧 TEST ENDPOINTS:');
            console.log('  GET  /health - Health check');
            console.log('  POST /api/create-admin - Create admin users');
            console.log('  GET  /api/test-admin - List admin users');
            console.log('  POST /login - Login endpoint');
            console.log('  POST /api/test-password - Test password');
            console.log('');
            console.log('🌐 Production URL: https://verbiforge.onrender.com');
        });
        
    } catch (error) {
        console.error('❌ Failed to start bulletproof server:', error);
        process.exit(1);
    }
}

// Handle process errors
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the bulletproof server
startServer();
