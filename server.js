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

console.log('🚀 SIMPLE VERBIFORGE SERVER STARTING...');
console.log('Port:', PORT);
console.log('Environment:', process.env.NODE_ENV);

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const dbDir = process.env.NODE_ENV === 'production' ? '/opt/render/project/src/data' : path.join(__dirname, 'data');
const dbPath = path.join(dbDir, 'verbiforge.db');

console.log('Database path:', dbPath);

// Create directory if it doesn't exist
if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('Created directory:', dbDir);
    } catch (error) {
        console.error('Error creating directory:', error);
    }
}

// Connect to database
let db;
try {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Database connection error:', err);
            process.exit(1);
        }
        console.log('Connected to database');
        
        // Initialize database
        initializeDatabase();
    });
} catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
}

// Database helper functions
const dbHelpers = {
    query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }
};

async function initializeDatabase() {
    console.log('🔧 Initializing database...');
    
    try {
        // Create users table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Users table ready');

        // Create projects table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                file_name TEXT NOT NULL,
                word_count INTEGER NOT NULL,
                breakdown TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT DEFAULT 'quote_generated',
                eta INTEGER,
                notes TEXT,
                project_type TEXT DEFAULT 'fusion',
                multiplier REAL DEFAULT 1.0,
                translated_file_name TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                submitted_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        console.log('✅ Projects table ready');

        // Create admin_users table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                is_super_admin BOOLEAN DEFAULT FALSE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_by TEXT
            )
        `);
        console.log('✅ Admin users table ready');

        // Create contact_submissions table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS contact_submissions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT,
                company TEXT,
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT DEFAULT 'new',
                is_read BOOLEAN DEFAULT FALSE,
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Contact submissions table ready');

        // Create settings table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Settings table ready');

        // Check if database already has data
        const hasExistingData = await checkExistingData();
        
        if (!hasExistingData) {
            // Only insert default settings and create admin users if database is empty
            console.log('📝 Database is empty - creating initial data...');
            
            // Insert default settings
            await dbHelpers.run(`
                INSERT OR IGNORE INTO settings (key, value) VALUES 
                ('languages', '{"English": 25, "Arabic": 50, "Chinese (Simplified)": 35, "Dutch": 40, "French": 35, "German": 45, "Portuguese (Brazil)": 35, "Portuguese (Portugal)": 35, "Spanish (Latin America)": 35, "Spanish (Spain)": 35}'),
                ('multiplier', '1.3')
            `);
            console.log('✅ Default settings inserted');

            // Create admin users
            await createAdminUsers();
        } else {
            console.log('✅ Preserving existing data - no initial setup needed');
        }
        
        console.log('🎉 Database initialization completed successfully!');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

async function createAdminUsers() {
    console.log('👑 Creating admin users...');
    
    try {
        const adminUsers = [
            {
                email: 'sid@verbiforge.com',
                password: 'admin123',
                name: 'Super Admin',
                role: 'super_admin'
            },
            {
                email: 'sid.bandewar@gmail.com',
                password: 'admin123',
                name: 'Super Admin',
                role: 'super_admin'
            }
        ];

        for (const admin of adminUsers) {
            // Check if user exists
            const existingUser = await dbHelpers.get('SELECT id FROM users WHERE email = ?', [admin.email]);
            
            if (!existingUser) {
                const userId = uuidv4();
                const hashedPassword = await bcrypt.hash(admin.password, 12);
                
                await dbHelpers.run(`
                    INSERT INTO users (id, email, password_hash, name, role, created_at) 
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [userId, admin.email, hashedPassword, admin.name, admin.role]);
                
                console.log(`✅ Admin user created: ${admin.email}`);
            } else {
                console.log(`ℹ️ Admin user already exists: ${admin.email}`);
            }
        }
        
        console.log('✅ Admin users setup completed');
        
    } catch (error) {
        console.error('❌ Error creating admin users:', error);
    }
}

// Check if database already has data
async function checkExistingData() {
    try {
        const userCount = await dbHelpers.get('SELECT COUNT(*) as count FROM users');
        const projectCount = await dbHelpers.get('SELECT COUNT(*) as count FROM projects');
        
        console.log(`📊 Existing data found: ${userCount.count} users, ${projectCount.count} projects`);
        
        if (userCount.count > 0 || projectCount.count > 0) {
            console.log('✅ Database has existing data - preserving all data');
            return true;
        } else {
            console.log('📝 Database is empty - will create initial data');
            return false;
        }
    } catch (error) {
        console.log('📝 Database is new - will create initial data');
        return false;
    }
}

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Simple VerbiForge server is running',
        database: dbPath,
        timestamp: new Date().toISOString()
    });
});

// Authentication middleware
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // For now, just check if user exists (simplified auth)
        const user = await dbHelpers.get('SELECT * FROM users WHERE id = ?', [token]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Authorization error' });
    }
};

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        const user = await dbHelpers.get('SELECT * FROM users WHERE email = ?', [email]);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            },
            token: user.id // Simplified token
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin check endpoint
app.get('/admin/check', requireAuth, requireAdmin, (req, res) => {
    res.json({
        isAdmin: true,
        isSuperAdmin: req.user.role === 'super_admin'
    });
});

// Admin projects endpoint
app.get('/admin/projects', requireAuth, requireAdmin, async (req, res) => {
    try {
        const projects = await dbHelpers.query(`
            SELECT p.*, u.name as userName, u.email as userEmail
            FROM projects p
            JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC
        `);
        
        res.json(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Admin languages endpoint
app.get('/admin/languages', requireAuth, requireAdmin, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        res.json(languages);
    } catch (error) {
        console.error('Error loading languages:', error);
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Update languages endpoint
app.put('/admin/languages', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { languages } = req.body;
        await dbHelpers.run(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            ['languages', JSON.stringify(languages)]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating languages:', error);
        res.status(500).json({ error: 'Failed to update languages' });
    }
});

// Admin users endpoint
app.get('/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await dbHelpers.query(`
            SELECT u.*, 
                   COUNT(p.id) as projectCount,
                   COALESCE(SUM(p.total), 0) as totalSpent
            FROM users u
            LEFT JOIN projects p ON u.id = p.user_id
            WHERE u.role = 'user'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);
        
        res.json(users);
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// Admin contacts endpoint
app.get('/admin/contacts', requireAuth, requireAdmin, async (req, res) => {
    try {
        const submissions = await dbHelpers.query(`
            SELECT * FROM contact_submissions 
            ORDER BY submitted_at DESC
        `);
        
        const unreadCount = submissions.filter(s => !s.is_read).length;
        
        res.json({
            submissions,
            unreadCount
        });
    } catch (error) {
        console.error('Error loading contacts:', error);
        res.status(500).json({ error: 'Failed to load contacts' });
    }
});

// Admin multiplier endpoint
app.get('/admin/multiplier', requireAuth, requireAdmin, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['multiplier']);
        const multiplier = setting ? parseFloat(setting.value) : 1.3;
        res.json({ multiplier });
    } catch (error) {
        console.error('Error loading multiplier:', error);
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

// Update multiplier endpoint
app.put('/admin/multiplier', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { multiplier } = req.body;
        await dbHelpers.run(
            'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            ['multiplier', multiplier.toString()]
        );
        res.json({ multiplier });
    } catch (error) {
        console.error('Error updating multiplier:', error);
        res.status(500).json({ error: 'Failed to update multiplier' });
    }
});

// Create admin endpoint
app.post('/api/create-admin', async (req, res) => {
    try {
        await createAdminUsers();
        res.json({ 
            success: true, 
            message: 'Admin users created',
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

// List users endpoint
app.get('/api/users', async (req, res) => {
    try {
        const users = await dbHelpers.query('SELECT email, name, role FROM users');
        res.json({ users });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test password endpoint
app.post('/api/test-password', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        const user = await dbHelpers.get('SELECT password_hash FROM users WHERE email = ?', [email]);
        
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
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Signup endpoint
app.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        
        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create new user
        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await dbHelpers.run(`
            INSERT INTO users (id, email, password_hash, name, role, created_at) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [userId, email, hashedPassword, name, 'user']);
        
        res.json({
            success: true,
            user: {
                id: userId,
                email: email,
                name: name,
                role: 'user'
            },
            token: userId
        });
        
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user info endpoint
app.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
});

// Logout endpoint
app.post('/logout', (req, res) => {
    res.json({ success: true });
});

// Get languages endpoint
app.get('/languages', requireAuth, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        res.json(languages);
    } catch (error) {
        console.error('Error loading languages:', error);
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Get user projects endpoint
app.get('/projects', requireAuth, async (req, res) => {
    try {
        const projects = await dbHelpers.query(`
            SELECT * FROM projects 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        `, [req.user.id]);
        
        res.json(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Create project endpoint
app.post('/projects', requireAuth, async (req, res) => {
    try {
        const { 
            name, 
            fileName, 
            wordCount, 
            projectType, 
            multiplier, 
            breakdown, 
            subtotal, 
            projectManagementCost, 
            total,
            notes 
        } = req.body;
        
        const projectId = uuidv4();
        
        await dbHelpers.run(`
            INSERT INTO projects (
                id, user_id, name, file_name, word_count, breakdown, 
                total, status, project_type, multiplier, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            projectId, req.user.id, name, fileName, wordCount, 
            JSON.stringify(breakdown), total, 'quote_generated', 
            projectType || 'fusion', multiplier || 1.0, notes
        ]);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [projectId]);
        
        res.json({ success: true, project });
        
    } catch (error) {
        console.error('Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Delete project endpoint
app.delete('/projects/:id', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        await dbHelpers.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Submit project endpoint
app.put('/projects/:id/submit', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        if (project.status !== 'quote_generated') {
            return res.status(400).json({ error: 'Project cannot be submitted in current status' });
        }
        
        await dbHelpers.run(`
            UPDATE projects 
            SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [req.params.id]);
        
        const updatedProject = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        
        res.json({ success: true, project: updatedProject });
        
    } catch (error) {
        console.error('Error submitting project:', error);
        res.status(500).json({ error: 'Failed to submit project' });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🎉 SIMPLE VERBIFORGE SERVER STARTED!');
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
    console.log('  POST /api/test-password');
    console.log('  GET /admin/projects');
    console.log('  GET /admin/languages');
    console.log('  GET /admin/users');
    console.log('  GET /admin/contacts');
});