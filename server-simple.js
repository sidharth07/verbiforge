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

console.log('🚀 Starting Simple VerbiForge server...');
console.log('  - Environment:', process.env.NODE_ENV);
console.log('  - Port:', PORT);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
let dbDir;
if (process.env.NODE_ENV === 'production') {
    dbDir = '/opt/render/project/src/data';
} else {
    dbDir = path.join(__dirname, 'data');
}

const dbPath = path.join(dbDir, 'verbiforge.db');
console.log('🎯 Database path:', dbPath);

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
    console.log('📁 Created database directory:', dbDir);
}

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        process.exit(1);
    }
    console.log('✅ Connected to database successfully');
});

// Initialize database tables
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        console.log('🗄️ Initializing database tables...');
        
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error('❌ Error creating users table:', err);
                reject(err);
                return;
            }
            console.log('✅ Users table created');
            
            // Create admin users
            createAdminUsers().then(resolve).catch(reject);
        });
    });
}

// Create admin users
async function createAdminUsers() {
    console.log('👤 Creating admin users...');
    
    const adminUsers = [
        { email: 'sid@verbiforge.com', name: 'Super Admin', password: 'admin123', isSuperAdmin: true },
        { email: 'sid.bandewar@gmail.com', name: 'Sid Bandewar (Google SSO)', password: 'admin123', isSuperAdmin: false }
    ];
    
    for (const admin of adminUsers) {
        await createAdminUser(admin.email, admin.name, admin.password, admin.isSuperAdmin);
    }
    
    console.log('🎉 Admin users created successfully!');
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
                // Create new admin user
                const userId = uuidv4();
                const hashedPassword = await bcrypt.hash(password, 12);
                
                db.run(`INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) 
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, 
                    [userId, email, hashedPassword, name, role], (err) => {
                    if (err) {
                        console.error(`❌ Error creating admin user ${email}:`, err);
                        reject(err);
                    } else {
                        console.log(`✅ Created admin user: ${email} (${role})`);
                        resolve();
                    }
                });
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
        environment: process.env.NODE_ENV
    });
});

// Manual admin creation endpoint
app.post('/api/create-admin', async (req, res) => {
    try {
        console.log('🔧 Manual admin creation requested');
        
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
        console.error('❌ Error in manual admin creation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
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
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            // Verify password
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
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
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Test admin endpoint
app.get('/api/test-admin', (req, res) => {
    db.all('SELECT email, name, role FROM users WHERE role IN ("admin", "super_admin")', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({
                admin_users: rows,
                count: rows.length
            });
        }
    });
});

// Start server
async function startServer() {
    try {
        // Initialize database and create admin users
        await initializeDatabase();
        
        // Start the server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Simple VerbiForge server running on port ${PORT}`);
            console.log(`🌐 Server accessible at: http://localhost:${PORT}`);
            console.log('📋 Admin Credentials:');
            console.log('  Email: sid@verbiforge.com');
            console.log('  Password: admin123');
            console.log('  Role: super_admin');
            console.log('');
            console.log('🔧 Emergency endpoints:');
            console.log('  POST /api/create-admin - Create admin users');
            console.log('  GET /api/test-admin - List admin users');
            console.log('  GET /health - Health check');
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
