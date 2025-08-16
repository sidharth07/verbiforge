require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const EmailService = require('./email-service');
const FileManager = require('./fileManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow common document formats
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, Word, Excel, and text files are allowed.'), false);
        }
    }
});

// PostgreSQL connection
console.log('🔗 Setting up PostgreSQL connection...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 DATABASE_URL: ${process.env.DATABASE_URL ? 'SET' : 'NOT SET'}`);

if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ DATABASE_URL environment variable is not set!');
        console.error('❌ This is required for PostgreSQL connection in production.');
        process.exit(1);
    } else {
        console.warn('⚠️ DATABASE_URL not set - using development fallback');
        console.warn('⚠️ For production, ensure DATABASE_URL is set in Render environment variables');
        // For development, you can set a local PostgreSQL URL here
        process.env.DATABASE_URL = 'postgresql://localhost:5432/verbiforge_dev';
    }
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL connection error:', err);
});

// Initialize Email Service
const emailService = new EmailService();
console.log('📧 Email service initialized');

// Initialize database schema (add missing columns if needed)
async function initializeDatabase() {
    try {
        console.log('🔧 Checking database schema...');
        
        // Check and add translated_file_path column if missing
        try {
            await dbHelpers.query(`
                ALTER TABLE projects 
                ADD COLUMN IF NOT EXISTS translated_file_path TEXT
            `);
            console.log('✅ translated_file_path column ready');
        } catch (error) {
            console.log('ℹ️ translated_file_path column already exists');
        }
        
        // Check and add subtotal column if missing
        try {
            await dbHelpers.query(`
                ALTER TABLE projects 
                ADD COLUMN IF NOT EXISTS subtotal REAL DEFAULT 0
            `);
            console.log('✅ subtotal column ready');
        } catch (error) {
            console.log('ℹ️ subtotal column already exists');
        }
        
        // Check and add project_management_cost column if missing
        try {
            await dbHelpers.query(`
                ALTER TABLE projects 
                ADD COLUMN IF NOT EXISTS project_management_cost REAL DEFAULT 500
            `);
            console.log('✅ project_management_cost column ready');
        } catch (error) {
            console.log('ℹ️ project_management_cost column already exists');
        }
        
        // Update existing projects with calculated subtotals
        console.log('🔧 Updating existing projects with calculated subtotals...');
        const projects = await dbHelpers.query(`
            SELECT id, breakdown, total, project_management_cost 
            FROM projects 
            WHERE subtotal IS NULL OR subtotal = 0
        `);
        
        console.log(`📋 Found ${projects.length} projects to update`);
        
        for (const project of projects) {
            try {
                let breakdown = [];
                if (project.breakdown) {
                    breakdown = JSON.parse(project.breakdown);
                }
                
                // Calculate subtotal from breakdown
                let subtotal = 0;
                if (Array.isArray(breakdown)) {
                    subtotal = breakdown.reduce((sum, item) => {
                        return sum + parseFloat(item.cost || 0);
                    }, 0);
                }
                
                // If no breakdown or subtotal is 0, estimate from total
                if (subtotal === 0 && project.total) {
                    const pmc = project.project_management_cost || 500;
                    subtotal = parseFloat(project.total) - pmc;
                }
                
                // Update the project
                await dbHelpers.run(`
                    UPDATE projects 
                    SET subtotal = $1, project_management_cost = $2
                    WHERE id = $3
                `, [subtotal, project.project_management_cost || 500, project.id]);
                
                console.log(`✅ Updated project ${project.id}: subtotal = $${subtotal.toFixed(2)}`);
                
            } catch (error) {
                console.error(`❌ Error updating project ${project.id}:`, error.message);
            }
        }
        
        console.log('🎉 Database schema initialization completed!');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        // Don't fail the server startup, just log the error
    }
}

// Initialize database schema
initializeDatabase();

// Database helpers
const dbHelpers = {
    query: async (sql, params = []) => {
        try {
            const client = await pool.connect();
            try {
                const result = await client.query(sql, params);
                return result.rows;
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    },
    get: async (sql, params = []) => {
        try {
            const client = await pool.connect();
            try {
                const result = await client.query(sql, params);
                return result.rows[0];
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('❌ Database get error:', error);
            throw error;
        }
    },
    run: async (sql, params = []) => {
        try {
            const client = await pool.connect();
            try {
                const result = await client.query(sql, params);
                return { id: result.rows[0]?.id, changes: result.rowCount };
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('❌ Database run error:', error);
            throw error;
        }
    }
};

// Check if database already has data
async function checkExistingData() {
    try {
        console.log('🔍 Checking for existing data...');
        
        // Check if tables exist first
        const tables = await dbHelpers.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name IN ('users', 'projects', 'contact_submissions', 'settings')
        `);
        
        console.log('📋 Existing tables:', tables.map(t => t.table_name));
        
        if (tables.length === 0) {
            console.log('📝 No tables found - database is completely new');
            return false;
        }
        
        const userCount = await dbHelpers.get('SELECT COUNT(*) as count FROM users');
        const projectCount = await dbHelpers.get('SELECT COUNT(*) as count FROM projects');
        const contactCount = await dbHelpers.get('SELECT COUNT(*) as count FROM contact_submissions');
        const settingsCount = await dbHelpers.get('SELECT COUNT(*) as count FROM settings');
        
        console.log(`📊 Existing data found: ${userCount.count} users, ${projectCount.count} projects, ${contactCount.count} contacts, ${settingsCount.count} settings`);
        
        if (userCount.count > 0 || projectCount.count > 0 || contactCount.count > 0) {
            console.log('✅ Database has existing data - preserving all data');
            return true;
        } else {
            console.log('📝 Database is empty - will create initial data');
            return false;
        }
    } catch (error) {
        console.log('📝 Database is new - will create initial data');
        console.error('Error checking existing data:', error);
        return false;
    }
}

async function createAdminUsers() {
    try {
        console.log('🔧 Creating admin users...');
        
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
            const existingUser = await dbHelpers.get('SELECT id FROM users WHERE email = $1', [admin.email]);
            
            if (!existingUser) {
                const userId = uuidv4();
                const hashedPassword = await bcrypt.hash(admin.password, 12);
                
                await dbHelpers.run(`
                    INSERT INTO users (id, email, password_hash, name, role, created_at) 
                    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
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

async function initializeDatabase() {
    console.log('🔧 Initializing PostgreSQL database...');
    
    try {
        // Create users table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                total DECIMAL(10,2) NOT NULL,
                status TEXT DEFAULT 'quote_generated',
                eta INTEGER,
                notes TEXT,
                project_type TEXT DEFAULT 'fusion',
                multiplier DECIMAL(3,2) DEFAULT 1.0,
                translated_file_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                submitted_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);
        console.log('✅ Projects table ready');

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
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Contact submissions table ready');

        // Create settings table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Settings table ready');

        // Check if database already has data
        const hasExistingData = await checkExistingData();
        
        // Always ensure default settings exist
        console.log('📝 Ensuring default settings exist...');
        
        // Insert default settings (will not overwrite if they exist)
        await dbHelpers.run(`
            INSERT INTO settings (key, value) VALUES 
            ('languages', '{"English": 25, "Arabic": 50, "Chinese (Simplified)": 35, "Dutch": 40, "French": 35, "German": 45, "Portuguese (Brazil)": 35, "Portuguese (Portugal)": 35, "Spanish (Latin America)": 35, "Spanish (Spain)": 35, "Italian": 40, "Japanese": 45, "Korean": 40, "Russian": 35, "Turkish": 35, "Vietnamese": 30, "Thai": 35, "Indonesian": 30, "Malay": 30, "Filipino": 30, "Hindi": 25, "Bengali": 25, "Urdu": 25, "Persian": 35, "Hebrew": 40, "Greek": 40, "Polish": 35, "Czech": 35, "Hungarian": 35, "Romanian": 35, "Bulgarian": 35, "Croatian": 35, "Serbian": 35, "Slovak": 35, "Slovenian": 35, "Estonian": 40, "Latvian": 40, "Lithuanian": 40, "Finnish": 45, "Swedish": 45, "Norwegian": 45, "Danish": 45, "Icelandic": 50, "Catalan": 35, "Basque": 45, "Galician": 35, "Welsh": 45, "Irish": 45, "Scottish Gaelic": 50, "Maltese": 45, "Luxembourgish": 50, "Faroese": 55, "Greenlandic": 60}'),
            ('multiplier', '1.3')
            ON CONFLICT (key) DO NOTHING
        `);
        console.log('✅ Default settings ensured');
        
        if (!hasExistingData) {
            // Only create admin users if database is empty
            console.log('📝 Database is empty - creating admin users...');
            
            // Create admin users
            await createAdminUsers();
        } else {
            console.log('✅ Preserving existing data - ensuring admin users exist...');
            
            // Always ensure admin users exist (won't overwrite if they already exist)
            await createAdminUsers();
        }
        
        console.log('✅ PostgreSQL database initialization completed');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

// Authentication middleware
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // For now, just check if user exists (simplified auth)
        const user = await dbHelpers.get('SELECT * FROM users WHERE id = $1', [token]);
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

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'VerbiForge PostgreSQL server is running',
        database: 'PostgreSQL',
        timestamp: new Date().toISOString()
    });
});

// Database health check endpoint
app.get('/health/database', async (req, res) => {
    try {
        // Check database connection
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        // Get table counts
        const userCount = await dbHelpers.get('SELECT COUNT(*) as count FROM users');
        const projectCount = await dbHelpers.get('SELECT COUNT(*) as count FROM projects');
        const contactCount = await dbHelpers.get('SELECT COUNT(*) as count FROM contact_submissions');
        const settingsCount = await dbHelpers.get('SELECT COUNT(*) as count FROM settings');
        
        res.json({
            status: 'ok',
            database: {
                type: 'PostgreSQL',
                connection: 'Connected',
                tables: {
                    users: userCount.count,
                    projects: projectCount.count,
                    contacts: contactCount.count,
                    settings: settingsCount.count
                },
                environment: process.env.NODE_ENV || 'development'
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Database health check error:', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
            database: {
                type: 'PostgreSQL',
                connection: 'Failed'
            }
        });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await dbHelpers.get('SELECT * FROM users WHERE email = $1', [email]);
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ 
            success: true, 
            token: user.id,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Signup endpoint
app.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name required' });
        }

        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT id FROM users WHERE email = $1', [email]);
        
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await dbHelpers.run(`
            INSERT INTO users (id, email, password_hash, name, role, created_at) 
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [userId, email, hashedPassword, name, 'user']);
        
        // Send welcome email
        try {
            await emailService.sendWelcomeEmail(email, name);
            console.log('✅ Welcome email sent to:', email);
        } catch (emailError) {
            console.error('❌ Failed to send welcome email:', emailError);
            // Don't fail the signup if email fails
        }
        
        res.json({ 
            success: true, 
            token: userId,
            user: {
                id: userId,
                email: email,
                name: name,
                role: 'user'
            }
        });
        
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// Get current user
app.get('/me', requireAuth, (req, res) => {
    res.json({ 
        success: true, 
        user: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role
        }
    });
});

// Logout endpoint
app.post('/logout', (req, res) => {
    res.json({ success: true });
});

// Get languages
app.get('/languages', requireAuth, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        res.json(languages);
    } catch (error) {
        console.error('Error loading languages:', error);
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Test email service (admin only)
app.post('/test-email', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const result = await emailService.testEmailService();
        if (result.success) {
            res.json({ success: true, message: 'Test email sent successfully', messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send test email: ' + result.error });
        }
    } catch (error) {
        console.error('❌ Error testing email service:', error);
        res.status(500).json({ error: 'Email service test failed: ' + error.message });
    }
});

// Get multiplier
app.get('/multiplier', requireAuth, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['multiplier']);
        const multiplier = setting ? parseFloat(setting.value) : 1.3;
        res.json({ multiplier });
    } catch (error) {
        console.error('Error loading multiplier:', error);
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

// Get user projects
app.get('/projects', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Loading projects for user:', req.user.id);
        
        const projects = await dbHelpers.query(`
            SELECT * FROM projects 
            WHERE user_id = $1 
            ORDER BY created_at DESC
        `, [req.user.id]);
        
        console.log('📋 Raw projects from DB:', projects);
        
        // Parse JSON fields for frontend
        const processedProjects = projects.map(project => {
            try {
                return {
                    ...project,
                    breakdown: project.breakdown ? JSON.parse(project.breakdown) : [],
                    created_at: project.created_at,
                    createdAt: project.created_at, // Add alias for frontend compatibility
                    fileName: project.file_name, // Add alias for frontend compatibility
                    wordCount: project.word_count, // Add alias for frontend compatibility
                    projectType: project.project_type, // Add alias for frontend compatibility
                    projectManagementCost: project.project_management_cost, // Add alias for frontend compatibility
                    subtotal: project.subtotal, // Add alias for frontend compatibility
                    translatedFileName: project.translated_file_name // Add alias for frontend compatibility
                };
            } catch (error) {
                console.error('❌ Error parsing project breakdown:', error, project);
                return {
                    ...project,
                    breakdown: [],
                    created_at: project.created_at,
                    createdAt: project.created_at,
                    fileName: project.file_name,
                    wordCount: project.word_count,
                    projectType: project.project_type,
                    projectManagementCost: project.project_management_cost,
                    subtotal: project.subtotal,
                    translatedFileName: project.translated_file_name
                };
            }
        });
        
        console.log('✅ Processed projects:', processedProjects);
        res.json(processedProjects);
    } catch (error) {
        console.error('❌ Error loading projects:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Create project
app.post('/projects', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Project creation request received');
        console.log('🔍 Request headers:', req.headers);
        console.log('🔍 Request body:', req.body);
        console.log('🔍 User:', req.user);
        
        const { 
            name, 
            projectName, // Handle both name and projectName
            fileName, 
            wordCount, 
            projectType, 
            multiplier, 
            breakdown, 
            subtotal, 
            projectManagementCost, 
            total,
            notes,
            tempFileId 
        } = req.body;
        
        // Use projectName if name is not provided
        const projectNameToUse = name || projectName;
        
        if (!projectNameToUse) {
            return res.status(400).json({ error: 'Project name is required' });
        }
        
        if (!fileName) {
            return res.status(400).json({ error: 'File name is required' });
        }
        
        if (!wordCount) {
            return res.status(400).json({ error: 'Word count is required' });
        }
        
        if (!breakdown || !Array.isArray(breakdown)) {
            return res.status(400).json({ error: 'Language breakdown is required' });
        }
        
        const projectId = uuidv4();
        
        console.log('🔍 Creating project with data:', {
            projectId,
            userId: req.user.id,
            name: projectNameToUse,
            fileName,
            wordCount,
            breakdown: breakdown.length,
            total,
            projectType,
            multiplier
        });
        
        await dbHelpers.run(`
            INSERT INTO projects (
                id, user_id, name, file_name, word_count, breakdown, 
                subtotal, project_management_cost, total, status, project_type, multiplier, notes, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        `, [
            projectId, req.user.id, projectNameToUse, fileName, wordCount, 
            JSON.stringify(breakdown), subtotal, projectManagementCost, total, 'quote_generated', 
            projectType || 'fusion', multiplier || 1.0, notes || ''
        ]);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [projectId]);
        
        // Send project creation email
        try {
            const user = await dbHelpers.get('SELECT email, name FROM users WHERE id = $1', [req.user.id]);
            if (user) {
                await emailService.sendProjectCreatedEmail(user.email, user.name, {
                    name: projectNameToUse,
                    fileName,
                    wordCount: parseInt(wordCount),
                    projectType: projectType || 'fusion',
                    total: parseFloat(total)
                });
                console.log('✅ Project creation email sent to:', user.email);
            }
        } catch (emailError) {
            console.error('❌ Failed to send project creation email:', emailError);
            // Don't fail the project creation if email fails
        }
        
        console.log('✅ Project created successfully:', project);
        res.json({ success: true, project });
        
    } catch (error) {
        console.error('❌ Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project: ' + error.message });
    }
});

// Delete project
app.delete('/projects/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 Delete project request:', { projectId: id, userId: req.user.id });
        
        // Check if project exists and belongs to user
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        
        // Delete the project
        await dbHelpers.run('DELETE FROM projects WHERE id = $1', [id]);
        
        console.log('✅ Project deleted successfully:', id);
        res.json({ success: true, message: 'Project deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project: ' + error.message });
    }
});

// Submit project
app.put('/projects/:id/submit', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 Submit project request:', { projectId: id, userId: req.user.id });
        
        // Check if project exists and belongs to user
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        
        // Update project status to submitted
        await dbHelpers.run('UPDATE projects SET status = $1 WHERE id = $2', ['submitted', id]);
        
        console.log('✅ Project submitted successfully:', id);
        res.json({ success: true, message: 'Project submitted successfully' });
        
    } catch (error) {
        console.error('❌ Error submitting project:', error);
        res.status(500).json({ error: 'Failed to submit project: ' + error.message });
    }
});

// Admin check endpoint
app.get('/admin/check', requireAuth, async (req, res) => {
    try {
        // Check if user is admin based on role in users table
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        const isSuperAdmin = req.user.role === 'super_admin';
        
        res.json({ isAdmin, isSuperAdmin });
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Failed to check admin status' });
    }
});

// Contact form endpoint
app.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, company, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Name, email, subject, and message are required' });
        }
        
        const contactId = uuidv4();
        
        await dbHelpers.run(`
            INSERT INTO contact_submissions (
                id, name, email, phone, company, subject, message, status, is_read, submitted_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        `, [contactId, name, email, phone || null, company || null, subject, message, 'new', false]);
        
        res.json({ success: true, message: 'Contact form submitted successfully' });
        
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Failed to submit contact form' });
    }
});

// File upload and analysis endpoint
app.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 File analysis request received');
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { languages, projectType } = req.body;
        
        // Parse languages if it's a JSON string
        let selectedLanguages = languages;
        if (typeof languages === 'string') {
            try {
                selectedLanguages = JSON.parse(languages);
            } catch (error) {
                console.error('❌ Error parsing languages JSON:', error);
                return res.status(400).json({ error: 'Invalid languages format' });
            }
        }
        
        if (!selectedLanguages || !Array.isArray(selectedLanguages) || selectedLanguages.length === 0) {
            return res.status(400).json({ error: 'No languages selected' });
        }

        console.log('📁 File info:', {
            originalname: req.file.originalname,
            size: req.file.size,
            languages: languages,
            languagesType: typeof languages,
            selectedLanguages: selectedLanguages,
            selectedLanguagesType: typeof selectedLanguages,
            projectType: projectType
        });

        // Get language pricing
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['languages']);
        const languagePricing = setting ? JSON.parse(setting.value) : {};
        
        // Get multiplier
        const multiplierSetting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['multiplier']);
        const globalMultiplier = multiplierSetting ? parseFloat(multiplierSetting.value) : 1.3;
        
        console.log('💰 Pricing data:', { languagePricing, globalMultiplier });

        // Calculate word count
        let wordCount = 0;
        const fileName = req.file.originalname;
        
        if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
            try {
                const workbook = XLSX.readFile(req.file.path);
                wordCount = 0;
                
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    data.forEach(row => {
                        if (Array.isArray(row)) {
                            row.forEach(cell => {
                                if (cell && typeof cell === 'string') {
                                    wordCount += cell.split(/\s+/).length;
                                }
                            });
                        }
                    });
                });
                
                console.log('📊 Excel word count calculated:', wordCount);
            } catch (excelError) {
                console.error('❌ Excel parsing error, using estimation:', excelError);
                // Fallback to estimation
                wordCount = Math.ceil(req.file.size / 100);
            }
        } else {
            // For other file types, estimate word count
            wordCount = Math.ceil(req.file.size / 100);
        }

        // Calculate costs for each language
        const breakdown = [];
        let subtotal = 0;
        
        const effectiveMultiplier = projectType === 'pure' ? globalMultiplier : 1.0;
        
        selectedLanguages.forEach(language => {
            const basePrice = languagePricing[language] || 25;
            // Convert cents per word to dollars (divide by 100)
            const cost = (wordCount * basePrice * effectiveMultiplier) / 100;
            
            console.log(`🔍 ${language}: basePrice=${basePrice} cents, wordCount=${wordCount}, cost=${cost.toFixed(2)} dollars`);
            
            breakdown.push({
                language: language,
                cost: cost.toFixed(2)
            });
            
            subtotal += cost;
        });

        const projectManagementCost = 500.00;
        const total = subtotal + projectManagementCost;

        console.log('💰 Final calculation:', {
            wordCount,
            subtotal: subtotal.toFixed(2),
            projectManagementCost,
            total: total.toFixed(2),
            multiplier: effectiveMultiplier
        });

        res.json({
            success: true,
            fileName: fileName,
            wordCount: wordCount,
            projectType: projectType || 'fusion',
            multiplier: effectiveMultiplier,
            breakdown: breakdown,
            subtotal: subtotal.toFixed(2),
            projectManagementCost: projectManagementCost.toFixed(2),
            total: total.toFixed(2),
            tempFileId: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ File analysis error:', error);
        res.status(500).json({ error: 'File analysis failed: ' + error.message });
    }
});

// Get all projects (admin)
app.get('/admin/projects', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔍 Loading all projects for admin');
        
        const projects = await dbHelpers.query(`
            SELECT p.*, u.name as user_name, u.email as user_email 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        
        console.log('📋 Raw admin projects from DB:', projects);
        
        // Parse JSON fields for frontend
        const processedProjects = projects.map(project => {
            try {
                return {
                    ...project,
                    breakdown: project.breakdown ? JSON.parse(project.breakdown) : [],
                    created_at: project.created_at,
                    createdAt: project.created_at, // Add alias for frontend compatibility
                    fileName: project.file_name, // Add alias for frontend compatibility
                    wordCount: project.word_count, // Add alias for frontend compatibility
                    projectType: project.project_type, // Add alias for frontend compatibility
                    projectManagementCost: project.project_management_cost, // Add alias for frontend compatibility
                    subtotal: project.subtotal, // Add alias for frontend compatibility
                    translatedFileName: project.translated_file_name // Add alias for frontend compatibility
                };
            } catch (error) {
                console.error('❌ Error parsing admin project breakdown:', error, project);
                return {
                    ...project,
                    breakdown: [],
                    created_at: project.created_at,
                    createdAt: project.created_at,
                    fileName: project.file_name,
                    wordCount: project.word_count,
                    projectType: project.project_type,
                    projectManagementCost: project.project_management_cost,
                    subtotal: project.subtotal,
                    translatedFileName: project.translated_file_name
                };
            }
        });
        
        console.log('✅ Processed admin projects:', processedProjects);
        res.json(processedProjects);
    } catch (error) {
        console.error('❌ Error loading admin projects:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Get users (admin)
app.get('/admin/users', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔍 Loading users for admin');
        console.log('🔍 Admin user:', { id: req.user.id, email: req.user.email, role: req.user.role });
        
        // First, let's try a simpler query to see if the basic connection works
        console.log('🔍 Testing basic users query...');
        const basicUsers = await dbHelpers.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC');
        console.log('✅ Basic users query successful, found:', basicUsers.length, 'users');
        
        // Now let's get project counts and totals for each user
        console.log('🔍 Getting project counts and totals for each user...');
        
        const usersWithProjects = await Promise.all(basicUsers.map(async (user) => {
            try {
                // Get project count for this user
                const projectCountResult = await dbHelpers.get(
                    'SELECT COUNT(*) as count FROM projects WHERE user_id = $1', 
                    [user.id]
                );
                const projectCount = projectCountResult ? projectCountResult.count : 0;
                
                // Get total spent for this user
                const totalSpentResult = await dbHelpers.get(
                    'SELECT COALESCE(SUM(total), 0) as total FROM projects WHERE user_id = $1', 
                    [user.id]
                );
                const totalSpent = totalSpentResult ? parseFloat(totalSpentResult.total) : 0;
                
                return {
                    ...user,
                    createdAt: user.created_at,
                    projectCount: projectCount,
                    totalSpent: totalSpent
                };
            } catch (error) {
                console.error(`❌ Error getting projects for user ${user.id}:`, error);
                return {
                    ...user,
                    createdAt: user.created_at,
                    projectCount: 0,
                    totalSpent: 0
                };
            }
        }));
        
        console.log('✅ Users with projects processed successfully, returning:', usersWithProjects.length, 'users');
        console.log('✅ Sample user data:', usersWithProjects[0] || 'No users found');
        
        res.json(usersWithProjects);
    } catch (error) {
        console.error('❌ Error loading users:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error message:', error.message);
        
        // Try to provide more specific error information
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            res.status(500).json({ error: 'Database table missing. Please check database setup.' });
        } else if (error.message.includes('syntax error')) {
            res.status(500).json({ error: 'Database query syntax error. Please check query.' });
        } else {
            res.status(500).json({ error: 'Failed to load users: ' + error.message });
        }
    }
});

// Delete user (super admin only)
app.delete('/admin/users/:id', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const { id } = req.params;
        console.log('🔍 Delete user request:', { userId: id, adminId: req.user.id });
        
        // Check if user exists
        const user = await dbHelpers.get('SELECT * FROM users WHERE id = $1', [id]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Delete user's projects first
        await dbHelpers.run('DELETE FROM projects WHERE user_id = $1', [id]);
        
        // Delete the user
        await dbHelpers.run('DELETE FROM users WHERE id = $1', [id]);
        
        console.log('✅ User deleted successfully:', id);
        res.json({ success: true, message: 'User and all their projects deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user: ' + error.message });
    }
});

// Get admin users
app.get('/admin/admins', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔍 Loading admin users');
        
        // For now, return admin users from the users table with admin roles
        const admins = await dbHelpers.query(`
            SELECT id, email, name, role, created_at, 
                   CASE WHEN role = 'super_admin' THEN true ELSE false END as is_super_admin,
                   'System' as created_by
            FROM users 
            WHERE role IN ('admin', 'super_admin')
            ORDER BY created_at DESC
        `);
        
        console.log('✅ Admin users loaded:', admins);
        res.json(admins);
    } catch (error) {
        console.error('❌ Error loading admin users:', error);
        res.status(500).json({ error: 'Failed to load admin users' });
    }
});

// Create admin user
app.post('/admin/admins', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const { email, name, tempPassword } = req.body;
        console.log('🔍 Create admin request:', { email, name, adminId: req.user.id });
        
        if (!email || !name || !tempPassword) {
            return res.status(400).json({ error: 'Email, name, and temporary password are required' });
        }
        
        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Hash the temporary password
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        // Create new admin user
        const adminId = uuidv4();
        await dbHelpers.run(`
            INSERT INTO users (id, email, name, password_hash, role, created_at) 
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [adminId, email, name, hashedPassword, 'admin']);
        
        const newAdmin = await dbHelpers.get('SELECT * FROM users WHERE id = $1', [adminId]);
        
        console.log('✅ Admin user created successfully:', newAdmin);
        res.json({ 
            success: true, 
            message: 'Admin user created successfully',
            admin: {
                id: newAdmin.id,
                email: newAdmin.email,
                name: newAdmin.name,
                role: newAdmin.role
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error);
        res.status(500).json({ error: 'Failed to create admin user: ' + error.message });
    }
});

// Delete admin user
app.delete('/admin/admins/:email', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const { email } = req.params;
        const decodedEmail = decodeURIComponent(email);
        console.log('🔍 Delete admin request:', { email: decodedEmail, adminId: req.user.id });
        
        // Check if admin exists and is not super admin
        const admin = await dbHelpers.get('SELECT * FROM users WHERE email = $1 AND role IN ($2, $3)', [decodedEmail, 'admin', 'super_admin']);
        if (!admin) {
            return res.status(404).json({ error: 'Admin user not found' });
        }
        
        if (admin.role === 'super_admin') {
            return res.status(403).json({ error: 'Cannot delete super admin users' });
        }
        
        // Delete the admin user
        await dbHelpers.run('DELETE FROM users WHERE email = $1', [decodedEmail]);
        
        console.log('✅ Admin user deleted successfully:', decodedEmail);
        res.json({ success: true, message: 'Admin user deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting admin user:', error);
        res.status(500).json({ error: 'Failed to delete admin user: ' + error.message });
    }
});

// Get individual project details (admin)
app.get('/admin/projects/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        console.log('🔍 Loading project details for admin:', id);
        
        const project = await dbHelpers.get(`
            SELECT p.*, u.name as user_name, u.email as user_email 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = $1
        `, [id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Parse JSON fields for frontend
        const processedProject = {
            ...project,
            breakdown: project.breakdown ? JSON.parse(project.breakdown) : [],
            created_at: project.created_at,
            createdAt: project.created_at,
            fileName: project.file_name,
            wordCount: project.word_count,
            projectType: project.project_type,
            projectManagementCost: project.project_management_cost,
            userName: project.user_name,
            userEmail: project.user_email
        };
        
        console.log('✅ Project details loaded:', processedProject);
        res.json(processedProject);
    } catch (error) {
        console.error('❌ Error loading project details:', error);
        res.status(500).json({ error: 'Failed to load project details' });
    }
});

// Update project status (admin)
app.put('/admin/projects/:id/status', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        const { status } = req.body;
        
        console.log('🔍 Updating project status:', { projectId: id, status, adminId: req.user.id });
        
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        
        // Check if project exists
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Update project status
        await dbHelpers.run('UPDATE projects SET status = $1 WHERE id = $2', [status, id]);
        
        console.log('✅ Project status updated successfully:', { projectId: id, status });
        res.json({ success: true, message: 'Project status updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating project status:', error);
        res.status(500).json({ error: 'Failed to update project status: ' + error.message });
    }
});

// Update project ETA (admin)
app.put('/admin/projects/:id/eta', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        const { eta } = req.body;
        
        console.log('🔍 Updating project ETA:', { projectId: id, eta, adminId: req.user.id });
        
        if (!eta || eta < 1) {
            return res.status(400).json({ error: 'Valid ETA (days) is required' });
        }
        
        // Check if project exists
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Update project ETA
        await dbHelpers.run('UPDATE projects SET eta = $1 WHERE id = $2', [eta, id]);
        
        console.log('✅ Project ETA updated successfully:', { projectId: id, eta });
        res.json({ success: true, message: 'Project ETA updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating project ETA:', error);
        res.status(500).json({ error: 'Failed to update project ETA: ' + error.message });
    }
});

// Download project file (admin)
app.get('/admin/projects/:id/download', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        console.log('🔍 Download request for project:', id);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // For now, return project info since we don't have file storage implemented
        res.json({ 
            success: true, 
            message: 'Download functionality not yet implemented',
            project: {
                id: project.id,
                name: project.name,
                fileName: project.file_name,
                status: project.status
            }
        });
        
    } catch (error) {
        console.error('❌ Error downloading project:', error);
        res.status(500).json({ error: 'Failed to download project: ' + error.message });
    }
});

// Upload translated file (admin)
app.post('/admin/projects/:id/upload-translated', requireAuth, upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 Admin upload translated file request received');
        console.log('🔍 Request params:', req.params);
        console.log('🔍 Request body:', req.body);
        console.log('🔍 Request file:', req.file);
        console.log('🔍 User:', { id: req.user.id, email: req.user.email, role: req.user.role });
        
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            console.log('❌ Access denied - not admin');
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        console.log('🔍 Upload translated file for project:', id);
        
        if (!req.file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log('🔍 File details:', {
            originalname: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        });
        
        // Check if project exists
        console.log('🔍 Checking if project exists...');
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        if (!project) {
            console.log('❌ Project not found:', id);
            return res.status(404).json({ error: 'Project not found' });
        }
        
        console.log('✅ Project found:', { id: project.id, name: project.name, status: project.status });
        
        // Save the translated file using FileManager
        console.log('🔍 Saving translated file using FileManager...');
        const savedFile = await FileManager.saveTranslatedFile(req.file, id);
        console.log('✅ File saved:', savedFile);
        
        // Save the translated file information to the database
        console.log('🔍 Updating database with file information...');
        await dbHelpers.run(`
            UPDATE projects 
            SET translated_file_name = $1, translated_file_path = $2, status = $3 
            WHERE id = $4
        `, [req.file.originalname, savedFile.filePath, 'completed', id]);
        
        console.log('✅ Database updated successfully');
        
        // Send project completion email to user
        try {
            const user = await dbHelpers.get('SELECT email, name FROM users WHERE id = $1', [project.user_id]);
            if (user) {
                await emailService.sendProjectCompletedEmail(user.email, user.name, {
                    name: project.name,
                    fileName: project.file_name,
                    translatedFileName: req.file.originalname,
                    wordCount: parseInt(project.word_count),
                    projectType: project.project_type
                });
                console.log('✅ Project completion email sent to:', user.email);
            }
        } catch (emailError) {
            console.error('❌ Failed to send project completion email:', emailError);
            // Don't fail the upload if email fails
        }
        
        console.log('✅ Translated file uploaded successfully:', {
            projectId: id,
            fileName: req.file.originalname,
            fileSize: req.file.size
        });
        
        res.json({ 
            success: true, 
            message: 'Translated file uploaded successfully',
            fileName: req.file.originalname,
            projectId: id
        });
        
    } catch (error) {
        console.error('❌ Error uploading translated file:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        
        // Provide more specific error information
        if (error.code === 'ENOENT') {
            res.status(500).json({ error: 'File system error - upload directory not found' });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'File too large - maximum size is 10MB' });
        } else if (error.message.includes('permission')) {
            res.status(500).json({ error: 'Permission error - cannot write file' });
        } else {
            res.status(500).json({ error: 'Failed to upload translated file: ' + error.message });
        }
    }
});

// Download translated file (user - for their own projects)
app.get('/projects/:id/download-translated', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 User download translated file for project:', id);
        console.log('🔍 User ID:', req.user.id);
        
        // Check if project exists and belongs to the user
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        
        console.log('✅ Project found and belongs to user:', { id: project.id, name: project.name, status: project.status });
        
        if (!project.translated_file_name) {
            return res.status(404).json({ error: 'No translated file available for this project' });
        }
        
        // Serve the actual file
        try {
            console.log('🔍 Serving translated file:', project.translated_file_path);
            console.log('🔍 Project data:', {
                id: project.id,
                translated_file_name: project.translated_file_name,
                translated_file_path: project.translated_file_path,
                status: project.status
            });
            
            const fileContent = await FileManager.getTranslatedFile(project.translated_file_path);
            console.log('✅ File content retrieved, size:', fileContent.length);
            
            // Set appropriate headers for file download
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${project.translated_file_name}"`);
            res.setHeader('Content-Length', fileContent.length);
            
            // Send the file content
            res.send(fileContent);
            console.log('✅ File sent successfully');
            
        } catch (fileError) {
            console.error('❌ Error serving file:', fileError);
            console.error('❌ Error message:', fileError.message);
            console.error('❌ Error stack:', fileError.stack);
            res.status(500).json({ error: 'Failed to serve translated file: ' + fileError.message });
        }
        
    } catch (error) {
        console.error('❌ Error downloading user translated file:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to download translated file: ' + error.message });
    }
});

// Upload translated file (user - for their own projects)
app.post('/projects/:id/upload-translated', requireAuth, upload.single('file'), async (req, res) => {
    try {
        console.log('🔍 User upload translated file request received');
        console.log('🔍 Request params:', req.params);
        console.log('🔍 Request body:', req.body);
        console.log('🔍 Request file:', req.file);
        console.log('🔍 User:', { id: req.user.id, email: req.user.email, role: req.user.role });
        
        const { id } = req.params;
        console.log('🔍 User upload translated file for project:', id);
        
        if (!req.file) {
            console.log('❌ No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log('🔍 File details:', {
            originalname: req.file.originalname,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: req.file.path
        });
        
        // Check if project exists and belongs to the user
        console.log('🔍 Checking if project exists and belongs to user...');
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1 AND user_id = $2', [id, req.user.id]);
        if (!project) {
            console.log('❌ Project not found or access denied:', { projectId: id, userId: req.user.id });
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        
        console.log('✅ Project found and belongs to user:', { id: project.id, name: project.name, status: project.status });
        
        // Save the translated file information to the database
        console.log('🔍 Updating database with file information...');
        await dbHelpers.run(`
            UPDATE projects 
            SET translated_file_name = $1, status = $2 
            WHERE id = $3
        `, [req.file.originalname, 'completed', id]);
        
        console.log('✅ Database updated successfully');
        
        console.log('✅ User translated file uploaded successfully:', {
            projectId: id,
            userId: req.user.id,
            fileName: req.file.originalname,
            fileSize: req.file.size
        });
        
        res.json({ 
            success: true, 
            message: 'Translated file uploaded successfully',
            fileName: req.file.originalname,
            projectId: id
        });
        
    } catch (error) {
        console.error('❌ Error uploading user translated file:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error code:', error.code);
        
        // Provide more specific error information
        if (error.code === 'ENOENT') {
            res.status(500).json({ error: 'File system error - upload directory not found' });
        } else if (error.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({ error: 'File too large - maximum size is 10MB' });
        } else if (error.message.includes('permission')) {
            res.status(500).json({ error: 'Permission error - cannot write file' });
        } else {
            res.status(500).json({ error: 'Failed to upload translated file: ' + error.message });
        }
    }
});

// Get contacts (admin)
app.get('/admin/contacts', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔍 Loading contacts for admin');
        
        const contacts = await dbHelpers.query(`
            SELECT 
                *,
                submitted_at as "submittedAt"
            FROM contact_submissions 
            ORDER BY submitted_at DESC
        `);
        
        // Count unread contacts
        const unreadResult = await dbHelpers.get(`
            SELECT COUNT(*) as "unreadCount" 
            FROM contact_submissions 
            WHERE is_read = false OR is_read IS NULL
        `);
        
        const unreadCount = unreadResult ? unreadResult.unreadCount : 0;
        
        console.log('✅ Contacts loaded:', { submissions: contacts, unreadCount });
        res.json({ 
            submissions: contacts, 
            unreadCount: unreadCount 
        });
    } catch (error) {
        console.error('❌ Error loading contacts:', error);
        res.status(500).json({ error: 'Failed to load contacts' });
    }
});

// Admin language management endpoints
app.get('/admin/languages', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        res.json(languages);
    } catch (error) {
        console.error('Error loading admin languages:', error);
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

app.get('/admin/languages/defaults', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const defaultLanguages = {
            "English": 25,
            "Arabic": 50,
            "Chinese (Simplified)": 35,
            "Dutch": 40,
            "French": 35,
            "German": 45,
            "Portuguese (Brazil)": 35,
            "Portuguese (Portugal)": 35,
            "Spanish (Latin America)": 35,
            "Spanish (Spain)": 35,
            "Italian": 40,
            "Japanese": 45,
            "Korean": 40,
            "Russian": 35,
            "Turkish": 35,
            "Vietnamese": 30,
            "Thai": 35,
            "Indonesian": 30,
            "Malay": 30,
            "Filipino": 30,
            "Hindi": 25,
            "Bengali": 25,
            "Urdu": 25,
            "Persian": 35,
            "Hebrew": 40,
            "Greek": 40,
            "Polish": 35,
            "Czech": 35,
            "Hungarian": 35,
            "Romanian": 35,
            "Bulgarian": 35,
            "Croatian": 35,
            "Serbian": 35,
            "Slovak": 35,
            "Slovenian": 35,
            "Estonian": 40,
            "Latvian": 40,
            "Lithuanian": 40,
            "Finnish": 45,
            "Swedish": 45,
            "Norwegian": 45,
            "Danish": 45,
            "Icelandic": 50,
            "Catalan": 35,
            "Basque": 45,
            "Galician": 35,
            "Welsh": 45,
            "Irish": 45,
            "Scottish Gaelic": 50,
            "Maltese": 45,
            "Luxembourgish": 50,
            "Faroese": 55,
            "Greenlandic": 60
        };
        
        res.json(defaultLanguages);
    } catch (error) {
        console.error('Error loading default languages:', error);
        res.status(500).json({ error: 'Failed to load default languages' });
    }
});

app.put('/admin/languages', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { languages } = req.body;
        await dbHelpers.run(`
            INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, ['languages', JSON.stringify(languages)]);
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error updating languages:', error);
        res.status(500).json({ error: 'Failed to update languages' });
    }
});

app.post('/admin/languages/reset', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const defaultLanguages = {
            "English": 25,
            "Arabic": 50,
            "Chinese (Simplified)": 35,
            "Dutch": 40,
            "French": 35,
            "German": 45,
            "Portuguese (Brazil)": 35,
            "Portuguese (Portugal)": 35,
            "Spanish (Latin America)": 35,
            "Spanish (Spain)": 35,
            "Italian": 40,
            "Japanese": 45,
            "Korean": 40,
            "Russian": 35,
            "Turkish": 35,
            "Vietnamese": 30,
            "Thai": 35,
            "Indonesian": 30,
            "Malay": 30,
            "Filipino": 30,
            "Hindi": 25,
            "Bengali": 25,
            "Urdu": 25,
            "Persian": 35,
            "Hebrew": 40,
            "Greek": 40,
            "Polish": 35,
            "Czech": 35,
            "Hungarian": 35,
            "Romanian": 35,
            "Bulgarian": 35,
            "Croatian": 35,
            "Serbian": 35,
            "Slovak": 35,
            "Slovenian": 35,
            "Estonian": 40,
            "Latvian": 40,
            "Lithuanian": 40,
            "Finnish": 45,
            "Swedish": 45,
            "Norwegian": 45,
            "Danish": 45,
            "Icelandic": 50,
            "Catalan": 35,
            "Basque": 45,
            "Galician": 35,
            "Welsh": 45,
            "Irish": 45,
            "Scottish Gaelic": 50,
            "Maltese": 45,
            "Luxembourgish": 50,
            "Faroese": 55,
            "Greenlandic": 60
        };
        
        await dbHelpers.run(`
            INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, ['languages', JSON.stringify(defaultLanguages)]);
        
        res.json({ success: true, languages: defaultLanguages });
    } catch (error) {
        console.error('Error resetting languages:', error);
        res.status(500).json({ error: 'Failed to reset languages' });
    }
});

// Admin multiplier management
app.get('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['multiplier']);
        const multiplier = setting ? parseFloat(setting.value) : 1.3;
        res.json({ multiplier });
    } catch (error) {
        console.error('Error loading multiplier:', error);
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

app.put('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { multiplier } = req.body;
        await dbHelpers.run(`
            INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
        `, ['multiplier', multiplier.toString()]);
        
        res.json({ success: true, multiplier });
    } catch (error) {
        console.error('Error updating multiplier:', error);
        res.status(500).json({ error: 'Failed to update multiplier' });
    }
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('❌ Global error handler caught:', error);
    console.error('❌ Request URL:', req.url);
    console.error('❌ Request method:', req.method);
    
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        url: req.url,
        method: req.method
    });
});

// Mark contact as read
app.put('/admin/contacts/:id/read', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🔍 Marking contact as read:', id);
        
        // Check if user is admin
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Mark contact as read
        const result = await dbHelpers.run(
            'UPDATE contact_submissions SET is_read = TRUE WHERE id = $1',
            [id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Contact message not found' });
        }
        
        console.log('✅ Contact marked as read successfully');
        res.json({ success: true, message: 'Contact marked as read' });
        
    } catch (error) {
        console.error('❌ Error marking contact as read:', error);
        res.status(500).json({ error: 'Failed to mark contact as read: ' + error.message });
    }
});

// Update contact status
app.put('/admin/contacts/:id/status', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        console.log('🔍 Updating contact status:', { id, status });
        
        // Check if user is admin
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Validate status
        const validStatuses = ['new', 'in_progress', 'resolved', 'closed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be one of: new, in_progress, resolved, closed' });
        }
        
        // Update contact status
        const result = await dbHelpers.run(
            'UPDATE contact_submissions SET status = $1 WHERE id = $2',
            [status, id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Contact message not found' });
        }
        
        console.log('✅ Contact status updated successfully');
        res.json({ success: true, message: 'Contact status updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating contact status:', error);
        res.status(500).json({ error: 'Failed to update contact status: ' + error.message });
    }
});

// Delete contact message
app.delete('/admin/contacts/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🔍 Deleting contact message:', id);
        
        // Check if user is admin
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Delete contact message
        const result = await dbHelpers.run(
            'DELETE FROM contact_submissions WHERE id = $1',
            [id]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Contact message not found' });
        }
        
        console.log('✅ Contact message deleted successfully');
        res.json({ success: true, message: 'Contact message deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting contact message:', error);
        res.status(500).json({ error: 'Failed to delete contact message: ' + error.message });
    }
});

// Catch-all route for undefined endpoints
app.use('*', (req, res) => {
    console.error('❌ 404 - Route not found:', req.originalUrl);
    console.error('❌ Available routes:');
    console.error('   - POST /login');
    console.error('   - POST /signup');
    console.error('   - GET /me');
    console.error('   - POST /logout');
    console.error('   - GET /languages');
    console.error('   - GET /multiplier');
    console.error('   - POST /analyze');
    console.error('   - POST /projects');
    console.error('   - GET /projects');
    console.error('   - DELETE /projects/:id');
    console.error('   - PUT /projects/:id/submit');
    console.error('   - GET /admin/check');
    console.error('   - POST /contact');
    console.error('   - GET /admin/projects');
    console.error('   - GET /admin/projects/:id');
    console.error('   - PUT /admin/projects/:id/status');
    console.error('   - PUT /admin/projects/:id/eta');
    console.error('   - GET /admin/projects/:id/download');
    console.error('   - POST /admin/projects/:id/upload-translated');
    console.error('   - GET /projects/:id/download-translated');
    console.error('   - POST /projects/:id/upload-translated');
    console.error('   - GET /admin/users');
    console.error('   - DELETE /admin/users/:id');
    console.error('   - GET /admin/admins');
    console.error('   - POST /admin/admins');
    console.error('   - DELETE /admin/admins/:email');
    console.error('   - GET /admin/contacts');
    console.error('   - PUT /admin/contacts/:id/read');
    console.error('   - PUT /admin/contacts/:id/status');
    console.error('   - DELETE /admin/contacts/:id');
    console.error('   - GET /health');
    
    res.status(404).json({ 
        error: 'Route not found',
        url: req.originalUrl,
        method: req.method,
        availableRoutes: [
            'POST /login',
            'POST /signup', 
            'GET /me',
            'POST /logout',
            'GET /languages',
            'GET /multiplier',
            'POST /analyze',
            'POST /projects',
            'GET /projects',
            'DELETE /projects/:id',
            'PUT /projects/:id/submit',
            'GET /admin/check',
            'POST /contact',
            'GET /admin/projects',
            'GET /admin/projects/:id',
            'PUT /admin/projects/:id/status',
            'PUT /admin/projects/:id/eta',
            'GET /admin/projects/:id/download',
            'POST /admin/projects/:id/upload-translated',
            'GET /projects/:id/download-translated',
            'POST /projects/:id/upload-translated',
            'GET /admin/users',
            'DELETE /admin/users/:id',
            'GET /admin/admins',
            'POST /admin/admins',
            'DELETE /admin/admins/:email',
            'GET /admin/contacts',
            'PUT /admin/contacts/:id/read',
            'PUT /admin/contacts/:id/status',
            'DELETE /admin/contacts/:id',
            'GET /health'
        ]
    });
});

// Start server
async function startServer() {
    try {
        console.log('🚀 Starting VerbiForge PostgreSQL server...');
        
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`✅ PostgreSQL server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/health`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
