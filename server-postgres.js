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

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🔗 Connecting to PostgreSQL database...');
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// Database helpers
const dbHelpers = {
    query: async (sql, params = []) => {
        const client = await pool.connect();
        try {
            const result = await client.query(sql, params);
            return result.rows;
        } finally {
            client.release();
        }
    },
    get: async (sql, params = []) => {
        const client = await pool.connect();
        try {
            const result = await client.query(sql, params);
            return result.rows[0];
        } finally {
            client.release();
        }
    },
    run: async (sql, params = []) => {
        const client = await pool.connect();
        try {
            const result = await client.query(sql, params);
            return { id: result.rows[0]?.id, changes: result.rowCount };
        } finally {
            client.release();
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
