const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 MINIMAL SERVER STARTING...');
console.log('Port:', PORT);
console.log('Environment:', process.env.NODE_ENV);

// Basic middleware
app.use(express.json());
app.use(express.static('public'));

// Database setup
const dbDir = process.env.NODE_ENV === 'production' ? '/opt/render/project/src/data' : path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'verbiforge.db');

console.log('Database path:', dbPath);

// Create directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('Created directory:', dbDir);
}

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Database error:', err);
        process.exit(1);
    }
    console.log('Connected to database');
    
    // Create table and admin users
    setupDatabase();
});

function setupDatabase() {
    console.log('Setting up database...');
    
    // Create users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Table creation error:', err);
            return;
        }
        console.log('Users table created');
        
        // Create admin user
        createAdminUser();
    });
}

async function createAdminUser() {
    console.log('Creating admin user...');
    
    const email = 'sid@verbiforge.com';
    const password = 'admin123';
    const name = 'Super Admin';
    const role = 'super_admin';
    
    // Check if user exists
    db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
        if (err) {
            console.error('Error checking user:', err);
            return;
        }
        
        if (row) {
            console.log('Admin user already exists');
        } else {
            // Create new admin user
            const userId = uuidv4();
            const hashedPassword = await bcrypt.hash(password, 12);
            
            db.run(`
                INSERT INTO users (id, email, password_hash, name, role, created_at) 
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [userId, email, hashedPassword, name, role], (err) => {
                if (err) {
                    console.error('Error creating admin user:', err);
                } else {
                    console.log('Admin user created successfully');
                    console.log('Email:', email);
                    console.log('Password:', password);
                    console.log('Role:', role);
                }
            });
        }
    });
}

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Minimal server is running',
        database: dbPath,
        timestamp: new Date().toISOString()
    });
});

// Create admin endpoint
app.post('/api/create-admin', async (req, res) => {
    try {
        await createAdminUser();
        res.json({ 
            success: true, 
            message: 'Admin user created',
            credentials: {
                email: 'sid@verbiforge.com',
                password: 'admin123',
                role: 'super_admin'
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        db.get('SELECT id, email, password_hash, name, role FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (!user) {
                console.log('User not found:', email);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
                console.log('Invalid password for:', email);
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            console.log('Successful login:', email, user.role);
            
            res.json({
                success: true,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                }
            });
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// List users endpoint
app.get('/api/users', (req, res) => {
    db.all('SELECT email, name, role FROM users', (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ users: rows });
        }
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🎉 MINIMAL SERVER STARTED!');
    console.log(`Server running on port ${PORT}`);
    console.log('Admin credentials:');
    console.log('  Email: sid@verbiforge.com');
    console.log('  Password: admin123');
    console.log('  Role: super_admin');
    console.log('');
    console.log('Test endpoints:');
    console.log('  GET /health');
    console.log('  POST /api/create-admin');
    console.log('  POST /login');
    console.log('  GET /api/users');
});
