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

// User ID generation utility
function generateUserId() {
    return new Promise(async (resolve, reject) => {
        try {
            // Get the next available user ID starting from 70000
            const result = await dbHelpers.get(`
                SELECT MAX(user_id) as max_user_id 
                FROM users 
                WHERE user_id IS NOT NULL AND user_id >= 70000
            `);
            
            let nextUserId = 70000;
            if (result && result.max_user_id) {
                nextUserId = Math.max(70000, result.max_user_id + 1);
            }
            
            console.log('🔢 Generated User ID:', nextUserId);
            resolve(nextUserId);
        } catch (error) {
            console.error('❌ Error generating User ID:', error);
            // Fallback to timestamp-based ID
            const fallbackId = 70000 + Math.floor(Math.random() * 1000);
            console.log('🔢 Using fallback User ID:', fallbackId);
            resolve(fallbackId);
        }
    });
}

// Assign User IDs to existing users who don't have them
async function assignUserIdsToExistingUsers() {
    try {
        console.log('🔧 Assigning User IDs to existing users...');
        
        // Get all users without user_id
        const usersWithoutId = await dbHelpers.query(`
            SELECT id, email, name, created_at 
            FROM users 
            WHERE user_id IS NULL 
            ORDER BY created_at ASC
        `);
        
        if (usersWithoutId.length === 0) {
            console.log('✅ All users already have User IDs');
            return;
        }
        
        console.log(`🔧 Found ${usersWithoutId.length} users without User IDs`);
        
        // Get the current max user_id
        const maxResult = await dbHelpers.get(`
            SELECT MAX(user_id) as max_user_id 
            FROM users 
            WHERE user_id IS NOT NULL AND user_id >= 70000
        `);
        
        let nextUserId = 70000;
        if (maxResult && maxResult.max_user_id) {
            nextUserId = Math.max(70000, maxResult.max_user_id + 1);
        }
        
        // Assign User IDs to each user
        for (const user of usersWithoutId) {
            try {
                await dbHelpers.run(`
                    UPDATE users SET user_id = $1 WHERE id = $2
                `, [nextUserId, user.id]);
                
                console.log(`✅ Assigned User ID ${nextUserId} to ${user.email}`);
                nextUserId++;
            } catch (error) {
                console.error(`❌ Error assigning User ID to ${user.email}:`, error);
            }
        }
        
        console.log('✅ User ID assignment completed');
        
    } catch (error) {
        console.error('❌ Error assigning User IDs to existing users:', error);
    }
}

// Project ID generation utility
function generateProjectId() {
    // Get the next available number starting from 700
    return new Promise(async (resolve, reject) => {
        try {
            // Check if project_id column exists first
            try {
                const result = await dbHelpers.get(`
                    SELECT MAX(CAST(SUBSTRING(project_id FROM 1 FOR POSITION('-' IN project_id) - 1) AS INTEGER)) as max_number 
                    FROM projects 
                    WHERE project_id IS NOT NULL AND project_id ~ '^[0-9]+-[A-Z]{2}$'
                `);
                
                let nextNumber = 700;
                if (result && result.max_number) {
                    nextNumber = Math.max(700, result.max_number + 1);
                }
                
                // Generate 2 random uppercase letters
                const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const letter1 = letters[Math.floor(Math.random() * letters.length)];
                const letter2 = letters[Math.floor(Math.random() * letters.length)];
                
                const projectId = `${nextNumber}-${letter1}${letter2}`;
                console.log('🔢 Generated project ID:', projectId);
                resolve(projectId);
            } catch (columnError) {
                // If project_id column doesn't exist, use fallback
                console.log('🔢 project_id column not ready, using fallback ID');
                const timestamp = Date.now();
                const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                const letter1 = letters[Math.floor(Math.random() * letters.length)];
                const letter2 = letters[Math.floor(Math.random() * letters.length)];
                const fallbackId = `${timestamp}-${letter1}${letter2}`;
                console.log('🔢 Using fallback project ID:', fallbackId);
                resolve(fallbackId);
            }
        } catch (error) {
            console.error('❌ Error generating project ID:', error);
            // Fallback to timestamp-based ID
            const timestamp = Date.now();
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const letter1 = letters[Math.floor(Math.random() * letters.length)];
            const letter2 = letters[Math.floor(Math.random() * letters.length)];
            const fallbackId = `${timestamp}-${letter1}${letter2}`;
            console.log('🔢 Using fallback project ID:', fallbackId);
            resolve(fallbackId);
        }
    });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Serve sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

// Serve robots.txt
app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, 'robots.txt'));
});
app.use(express.static('public', {
    etag: false,
    lastModified: false,
    maxAge: '0',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.setHeader('Surrogate-Control', 'no-store');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

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
    ssl: {
        rejectUnauthorized: false,
        require: true
    }
});

// Test the connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL connection error:', err);
});

// Fallback initialization in case connection event doesn't fire
setTimeout(() => {
    console.log('🔧 Running fallback database initialization...');
    initializeDatabase();
}, 5000); // Run after 5 seconds as fallback

// Initialize Email Service
const emailService = new EmailService();
console.log('📧 Email service initialized');

// Initialize database schema (add missing columns if needed)
async function initializeDatabase() {
    try {
        console.log('🔧 Checking database schema...');
        
        // Add columns if they don't exist (ignore errors if they already exist)
        const columns = [
            { name: 'translated_file_path', type: 'TEXT' },
            { name: 'subtotal', type: 'REAL DEFAULT 0' },
            { name: 'project_management_cost', type: 'REAL DEFAULT 500' },
            { name: 'project_id', type: 'VARCHAR(20)' }
        ];
        
        for (const column of columns) {
            try {
                await dbHelpers.query(`
                    ALTER TABLE projects 
                    ADD COLUMN ${column.name} ${column.type}
                `);
                console.log(`✅ Added ${column.name} column`);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log(`ℹ️ ${column.name} column already exists`);
                } else {
                    console.error(`❌ Error adding ${column.name} column:`, error.message);
                }
            }
        }
        
        console.log('🎉 Database schema initialization completed!');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        // Don't fail the server startup, just log the error
    }
}

// Initialize database schema after connection is established
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
    // Run database initialization after connection is established
    setTimeout(() => {
        initializeDatabase();
    }, 2000); // Wait 2 seconds to ensure connection is stable
});

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
                const userDisplayId = await generateUserId();
                const hashedPassword = await bcrypt.hash(admin.password, 12);
                
                await dbHelpers.run(`
                    INSERT INTO users (id, user_id, email, password_hash, name, role, license, created_at) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                `, [userId, userDisplayId, admin.email, hashedPassword, admin.name, admin.role, 'Professional']);
                
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
                user_id INTEGER UNIQUE,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                license TEXT DEFAULT 'Free',
                parent_user_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_user_id) REFERENCES users (id)
            )
        `);
        console.log('✅ Users table ready');

        // Add license column to users table if it doesn't exist
        try {
            await dbHelpers.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS license TEXT DEFAULT 'Free'
            `);
            console.log('✅ License column added to users table');
        } catch (error) {
            console.log('ℹ️ License column already exists or error adding it:', error.message);
        }

        // Add user_id column to users table if it doesn't exist
        try {
            await dbHelpers.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS user_id INTEGER UNIQUE
            `);
            console.log('✅ User ID column added to users table');
            
            // Assign User IDs to existing users who don't have them
            await assignUserIdsToExistingUsers();
        } catch (error) {
            console.log('ℹ️ User ID column already exists or error adding it:', error.message);
        }

        // Add parent_user_id column for sub-user relationships
        try {
            await dbHelpers.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS parent_user_id TEXT
            `);
            console.log('✅ Parent User ID column added to users table');
        } catch (error) {
            console.log('ℹ️ Parent User ID column already exists or error adding it:', error.message);
        }

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
        
        // Ensure unique constraint exists on key column
        try {
            await dbHelpers.run(`
                ALTER TABLE settings ADD CONSTRAINT settings_key_unique UNIQUE (key)
            `);
            console.log('✅ Settings unique constraint added');
        } catch (error) {
            // Constraint might already exist, that's fine
            console.log('ℹ️ Settings unique constraint already exists or not needed');
        }

        // Create email_templates table
        await dbHelpers.run(`
            CREATE TABLE IF NOT EXISTS email_templates (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE NOT NULL,
                subject TEXT NOT NULL,
                html_content TEXT NOT NULL,
                description TEXT,
                variables TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Email templates table ready');

        // Initialize default email templates if table is empty
        try {
            const templateCount = await dbHelpers.get('SELECT COUNT(*) as count FROM email_templates');
            if (templateCount.count === 0) {
                console.log('📧 Initializing default email templates...');
                try {
                    await initializeEmailTemplates();
                    console.log('✅ Email templates initialization completed');
                } catch (initError) {
                    console.error('❌ Error initializing email templates:', initError);
                }
            }
        } catch (error) {
            console.log('📧 Email templates table not found, creating it...');
            try {
                await initializeEmailTemplates();
                console.log('✅ Email templates initialization completed');
            } catch (initError) {
                console.error('❌ Error initializing email templates:', initError);
            }
        }

        // Check if database already has data
        const hasExistingData = await checkExistingData();
        
        // Always ensure default settings exist
        console.log('📝 Ensuring default settings exist...');
        
        // Insert default settings (will not overwrite if they exist)
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value) VALUES 
                ('languages', '{"English": 25, "Arabic": 50, "Chinese (Simplified)": 35, "Dutch": 40, "French": 35, "German": 45, "Portuguese (Brazil)": 35, "Portuguese (Portugal)": 35, "Spanish (Latin America)": 35, "Spanish (Spain)": 35, "Italian": 40, "Japanese": 45, "Korean": 40, "Russian": 35, "Turkish": 35, "Vietnamese": 30, "Thai": 35, "Indonesian": 30, "Malay": 30, "Filipino": 30, "Hindi": 25, "Bengali": 25, "Urdu": 25, "Persian": 35, "Hebrew": 40, "Greek": 40, "Polish": 35, "Czech": 35, "Hungarian": 35, "Romanian": 35, "Bulgarian": 35, "Croatian": 35, "Serbian": 35, "Slovak": 35, "Slovenian": 35, "Estonian": 40, "Latvian": 40, "Lithuanian": 40, "Finnish": 45, "Swedish": 45, "Norwegian": 45, "Danish": 45, "Icelandic": 50, "Catalan": 35, "Basque": 45, "Galician": 35, "Welsh": 45, "Irish": 45, "Scottish Gaelic": 50, "Maltese": 45, "Luxembourgish": 50, "Faroese": 55, "Greenlandic": 60}'),
                ('multiplier', '1.3')
                ON CONFLICT (key) DO NOTHING
            `);
            console.log('✅ Default settings inserted successfully');
        } catch (error) {
            // If ON CONFLICT fails, try without it (for databases without proper constraints)
            console.log('⚠️ ON CONFLICT not supported, using alternative approach for settings');
            try {
                await dbHelpers.run(`
                    INSERT INTO settings (key, value) 
                    SELECT 'languages', '{"English": 25, "Arabic": 50, "Chinese (Simplified)": 35, "Dutch": 40, "French": 35, "German": 45, "Portuguese (Brazil)": 35, "Portuguese (Portugal)": 35, "Spanish (Latin America)": 35, "Spanish (Spain)": 35, "Italian": 40, "Japanese": 45, "Korean": 40, "Russian": 35, "Turkish": 35, "Vietnamese": 30, "Thai": 35, "Indonesian": 30, "Malay": 30, "Filipino": 30, "Hindi": 25, "Bengali": 25, "Urdu": 25, "Persian": 35, "Hebrew": 40, "Greek": 40, "Polish": 35, "Czech": 35, "Hungarian": 35, "Romanian": 35, "Bulgarian": 35, "Croatian": 35, "Serbian": 35, "Slovak": 35, "Slovenian": 35, "Estonian": 40, "Latvian": 40, "Lithuanian": 40, "Finnish": 45, "Swedish": 45, "Norwegian": 45, "Danish": 45, "Icelandic": 50, "Catalan": 35, "Basque": 45, "Galician": 35, "Welsh": 45, "Irish": 45, "Scottish Gaelic": 50, "Maltese": 45, "Luxembourgish": 50, "Faroese": 55, "Greenlandic": 60}'
                    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'languages')
                `);
                await dbHelpers.run(`
                    INSERT INTO settings (key, value) 
                    SELECT 'multiplier', '1.3'
                    WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'multiplier')
                `);
                console.log('✅ Default settings inserted using alternative method');
            } catch (fallbackError) {
                console.error('❌ Failed to insert default settings:', fallbackError);
            }
        }
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

async function initializeEmailTemplates() {
    try {
        console.log('🔧 Initializing default email templates...');
        
        const defaultTemplates = [
            {
                id: uuidv4(),
                name: 'welcome_email',
                subject: 'Welcome to VerbiForge! 🚀',
                description: 'Email sent to new users when they sign up',
                variables: JSON.stringify([
                    { name: 'userName', description: 'User\'s first name', example: 'John' },
                    { name: 'userEmail', description: 'User\'s email address', example: 'john@example.com' },
                    { name: 'appUrl', description: 'Application URL', example: 'https://verbiforge.com' }
                ]),
                html_content: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to VerbiForge!</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Professional Translation Services</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi {{userName}}! 👋</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Thank you for joining VerbiForge! We're excited to help you with your translation projects.
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">What you can do now:</h3>
                                <ul style="color: #666; line-height: 1.8;">
                                    <li>📁 Upload your documents for translation</li>
                                    <li>🌍 Choose from 100+ languages</li>
                                    <li>💰 Get instant pricing quotes</li>
                                    <li>📊 Track your project progress</li>
                                    <li>📥 Download completed translations</li>
                                </ul>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{appUrl}}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    Get Started with Your First Project
                                </a>
                            </div>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                If you have any questions, feel free to reach out to our support team. We're here to help!
                            </p>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Best regards,<br>
                                The VerbiForge Team
                            </p>
                        </div>
                    </div>
                `
            },
            {
                id: uuidv4(),
                name: 'project_created',
                subject: 'Project Created: {{projectName}} 📋',
                description: 'Email sent to users when a project is created',
                variables: JSON.stringify([
                    { name: 'userName', description: 'User\'s first name', example: 'John' },
                    { name: 'userEmail', description: 'User\'s email address', example: 'john@example.com' },
                    { name: 'projectName', description: 'Name of the project', example: 'Website Translation' },
                    { name: 'fileName', description: 'Original file name', example: 'website.xlsx' },
                    { name: 'wordCount', description: 'Total word count', example: '1,250' },
                    { name: 'projectType', description: 'Type of project', example: 'Fusion' },
                    { name: 'total', description: 'Total cost', example: '$45.50' },
                    { name: 'appUrl', description: 'Application URL', example: 'https://verbiforge.com' }
                ]),
                html_content: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Project Created Successfully!</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your translation project is ready</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi {{userName}}! 🎉</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Your translation project has been created successfully. Here are the details:
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Details:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">File:</td>
                                        <td style="padding: 8px 0; color: #333;">{{fileName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">{{wordCount}} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectType}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Cost:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">{{total}}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
                                <h4 style="color: #1976d2; margin-top: 0;">Next Steps:</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    Your project is now in our queue. Our team will review it and begin the translation process. 
                                    You'll receive updates as your project progresses.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{appUrl}}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    View Project Dashboard
                                </a>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Thank you for choosing VerbiForge!<br>
                                We'll keep you updated on your project's progress.
                            </p>
                        </div>
                    </div>
                `
            },
            {
                id: uuidv4(),
                name: 'project_completed',
                subject: 'Project Completed: {{projectName}} ✅',
                description: 'Email sent to users when a project is completed',
                variables: JSON.stringify([
                    { name: 'userName', description: 'User\'s first name', example: 'John' },
                    { name: 'userEmail', description: 'User\'s email address', example: 'john@example.com' },
                    { name: 'projectName', description: 'Name of the project', example: 'Website Translation' },
                    { name: 'fileName', description: 'Original file name', example: 'website.xlsx' },
                    { name: 'translatedFileName', description: 'Translated file name', example: 'website_translated.xlsx' },
                    { name: 'wordCount', description: 'Total word count', example: '1,250' },
                    { name: 'projectType', description: 'Type of project', example: 'Fusion' },
                    { name: 'appUrl', description: 'Application URL', example: 'https://verbiforge.com' }
                ]),
                html_content: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">Project Completed! 🎉</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Your translation is ready for download</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Hi {{userName}}! 🚀</h2>
                            
                            <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
                                Great news! Your translation project has been completed successfully. Your files are ready for download.
                            </p>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Summary:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Original File:</td>
                                        <td style="padding: 8px 0; color: #333;">{{fileName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Translated File:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">{{translatedFileName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">{{wordCount}} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectType}}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
                                <h4 style="color: #155724; margin-top: 0;">Ready for Download! 📥</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    Your translated file is now available in your dashboard. You can download it anytime.
                                </p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{appUrl}}/dashboard.html" 
                                   style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    Download Your Translation
                                </a>
                            </div>
                            
                            <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                                <h4 style="color: #856404; margin-top: 0;">We'd Love Your Feedback! ⭐</h4>
                                <p style="color: #666; margin-bottom: 0;">
                                    How was your experience with VerbiForge? We'd appreciate your feedback to help us improve our services.
                                </p>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                Thank you for choosing VerbiForge!<br>
                                We hope to work with you again soon.
                            </p>
                        </div>
                    </div>
                `
            },
            {
                id: uuidv4(),
                name: 'admin_notification',
                subject: 'New Project Created: {{projectName}} 📋',
                description: 'Email sent to admin when a new project is created',
                variables: JSON.stringify([
                    { name: 'projectName', description: 'Name of the project', example: 'Website Translation' },
                    { name: 'projectId', description: 'Project ID', example: 'PROJ-12345' },
                    { name: 'fileName', description: 'Original file name', example: 'website.xlsx' },
                    { name: 'wordCount', description: 'Total word count', example: '1,250' },
                    { name: 'projectType', description: 'Type of project', example: 'Fusion' },
                    { name: 'total', description: 'Total cost', example: '$45.50' },
                    { name: 'userName', description: 'User\'s first name', example: 'John' },
                    { name: 'userEmail', description: 'User\'s email address', example: 'john@example.com' },
                    { name: 'appUrl', description: 'Application URL', example: 'https://verbiforge.com' }
                ]),
                html_content: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">New Project Alert! 🚨</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">A new project has been created</p>
                        </div>
                        
                        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                            <h2 style="color: #333; margin-bottom: 20px;">Project Details 📊</h2>
                            
                            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <h3 style="color: #333; margin-top: 0;">Project Information:</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Name:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project ID:</td>
                                        <td style="padding: 8px 0; color: #333; font-family: monospace;">{{projectId}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">File:</td>
                                        <td style="padding: 8px 0; color: #333;">{{fileName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Word Count:</td>
                                        <td style="padding: 8px 0; color: #333;">{{wordCount}} words</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Project Type:</td>
                                        <td style="padding: 8px 0; color: #333;">{{projectType}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Total Cost:</td>
                                        <td style="padding: 8px 0; color: #28a745; font-weight: bold;">{{total}}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
                                <h4 style="color: #1976d2; margin-top: 0;">Client Information:</h4>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Name:</td>
                                        <td style="padding: 8px 0; color: #333;">{{userName}}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                                        <td style="padding: 8px 0; color: #333;">{{userEmail}}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="{{appUrl}}/admin.html" 
                                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                                    View Project in Admin Panel
                                </a>
                            </div>
                            
                            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
                            
                            <p style="color: #999; font-size: 14px; text-align: center;">
                                This is an automated notification from VerbiForge.<br>
                                You can manage this project from the Admin Panel.
                            </p>
                        </div>
                    </div>
                `
            }
        ];

        for (const template of defaultTemplates) {
            await dbHelpers.run(`
                INSERT INTO email_templates (id, name, subject, html_content, description, variables, is_active) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [template.id, template.name, template.subject, template.html_content, template.description, template.variables, true]);
            
            console.log(`✅ Email template created: ${template.name}`);
        }
        
        console.log('✅ Default email templates initialized');
        
    } catch (error) {
        console.error('❌ Error initializing email templates:', error);
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
        
        // Check if email_templates table exists
        let emailTemplatesCount = null;
        try {
            emailTemplatesCount = await dbHelpers.get('SELECT COUNT(*) as count FROM email_templates');
        } catch (error) {
            emailTemplatesCount = { count: 'Table does not exist' };
        }
        
        res.json({
            status: 'ok',
            database: {
                type: 'PostgreSQL',
                connection: 'Connected',
                tables: {
                    users: userCount.count,
                    projects: projectCount.count,
                    contacts: contactCount.count,
                    settings: settingsCount.count,
                    email_templates: emailTemplatesCount.count
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
                user_id: user.user_id,
                email: user.email,
                name: user.name,
                role: user.role,
                license: user.license || 'Free'
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
        const userDisplayId = await generateUserId();
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await dbHelpers.run(`
            INSERT INTO users (id, user_id, email, password_hash, name, role, license, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `, [userId, userDisplayId, email, hashedPassword, name, 'user', 'Free']);
        
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
                user_id: userDisplayId,
                email: email,
                name: name,
                role: 'user',
                license: 'Free'
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
            role: req.user.role,
            license: req.user.license || 'Free',
            user_id: req.user.user_id
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

// Test admin notification email (admin only)
app.post('/test-admin-notification', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const result = await emailService.sendProjectCreatedNotificationToAdmin({
            projectName: 'Test Project',
            fileName: 'test-file.xlsx',
            wordCount: 1000,
            projectType: 'fusion',
            total: 1500.00,
            userEmail: 'test@example.com',
            userName: 'Test User',
            projectId: 'test-project-id',
            breakdown: [
                { language: 'English', cost: '1000.00' },
                { language: 'Spanish', cost: '500.00' }
            ]
        });
        
        if (result.success) {
            res.json({ success: true, message: 'Admin notification test sent successfully', messageId: result.messageId });
        } else {
            res.status(500).json({ error: 'Failed to send admin notification: ' + result.error });
        }
    } catch (error) {
        console.error('❌ Error testing admin notification:', error);
        res.status(500).json({ error: 'Admin notification test failed: ' + error.message });
    }
});

// Debug endpoint to check project data (admin only)
app.get('/debug/project/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { id } = req.params;
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json({
            success: true,
            project: {
                id: project.id,
                name: project.name,
                status: project.status,
                translated_file_name: project.translated_file_name,
                translated_file_path: project.translated_file_path,
                user_id: project.user_id,
                created_at: project.created_at
            }
        });
    } catch (error) {
        console.error('❌ Error in debug endpoint:', error);
        res.status(500).json({ error: 'Debug endpoint failed: ' + error.message });
    }
});

// Fix projects with missing translated_file_path (admin only)
app.post('/fix-translated-files', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        // Find projects with translated_file_name but missing translated_file_path
        const projects = await dbHelpers.query(`
            SELECT id, translated_file_name, translated_file_path 
            FROM projects 
            WHERE translated_file_name IS NOT NULL 
            AND (translated_file_path IS NULL OR translated_file_path = '')
        `);
        
        console.log('🔍 Found projects with missing translated_file_path:', projects.length);
        
        const fixedProjects = [];
        const failedProjects = [];
        
        for (const project of projects) {
            try {
                // Generate a default file path based on the file name
                const defaultPath = `translated_${project.id}_${Date.now()}_${project.translated_file_name}`;
                
                await dbHelpers.run(`
                    UPDATE projects 
                    SET translated_file_path = $1 
                    WHERE id = $2
                `, [defaultPath, project.id]);
                
                fixedProjects.push({
                    id: project.id,
                    oldPath: project.translated_file_path,
                    newPath: defaultPath
                });
                
                console.log('✅ Fixed project:', project.id, 'with path:', defaultPath);
            } catch (error) {
                console.error('❌ Failed to fix project:', project.id, error.message);
                failedProjects.push({
                    id: project.id,
                    error: error.message
                });
            }
        }
        
        res.json({
            success: true,
            message: `Fixed ${fixedProjects.length} projects, ${failedProjects.length} failed`,
            fixedProjects,
            failedProjects
        });
        
    } catch (error) {
        console.error('❌ Error fixing translated files:', error);
        res.status(500).json({ error: 'Failed to fix translated files: ' + error.message });
    }
});

// Add missing project_id column (admin only)
app.post('/fix-project-ids', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔧 Adding project_id column to database...');
        
        try {
            // Add project_id column
            await dbHelpers.query(`
                ALTER TABLE projects 
                ADD COLUMN project_id VARCHAR(20)
            `);
            console.log('✅ Added project_id column');
            
            // Generate project IDs for existing projects
            const projects = await dbHelpers.query(`
                SELECT id FROM projects 
                WHERE project_id IS NULL OR project_id = ''
            `);
            
            console.log('🔍 Found projects without project_id:', projects.length);
            
            const fixedProjects = [];
            const failedProjects = [];
            
            for (const project of projects) {
                try {
                    const projectId = await generateProjectId();
                    
                    await dbHelpers.run(`
                        UPDATE projects 
                        SET project_id = $1 
                        WHERE id = $2
                    `, [projectId, project.id]);
                    
                    fixedProjects.push({
                        id: project.id,
                        projectId: projectId
                    });
                    
                    console.log('✅ Fixed project:', project.id, 'with ID:', projectId);
                } catch (error) {
                    console.error('❌ Failed to fix project:', project.id, error.message);
                    failedProjects.push({
                        id: project.id,
                        error: error.message
                    });
                }
            }
            
            res.json({
                success: true,
                message: `Added project_id column and fixed ${fixedProjects.length} projects, ${failedProjects.length} failed`,
                fixedProjects,
                failedProjects
            });
            
        } catch (columnError) {
            if (columnError.message.includes('already exists')) {
                console.log('ℹ️ project_id column already exists');
                res.json({
                    success: true,
                    message: 'project_id column already exists'
                });
            } else {
                throw columnError;
            }
        }
        
    } catch (error) {
        console.error('❌ Error fixing project IDs:', error);
        res.status(500).json({ error: 'Failed to fix project IDs: ' + error.message });
    }
});

// Fix database schema issues (admin only)
app.post('/fix-database-schema', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔧 Fixing database schema issues...');
        
        const results = {
            usersTable: { success: false, message: '', details: [] },
            projectsTable: { success: false, message: '', details: [] }
        };
        
        // Fix Users table - ensure user_id column exists and has data
        try {
            console.log('🔧 Checking Users table...');
            
            // Check if user_id column exists
            const columnExists = await dbHelpers.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name = 'user_id'
            `);
            
            if (columnExists.length === 0) {
                console.log('🔧 Adding user_id column to users table...');
                await dbHelpers.query(`
                    ALTER TABLE users ADD COLUMN user_id INTEGER UNIQUE
                `);
                results.usersTable.details.push('Added user_id column');
            } else {
                results.usersTable.details.push('user_id column already exists');
            }
            
            // Check for users without user_id
            const usersWithoutId = await dbHelpers.query(`
                SELECT COUNT(*) as count FROM users WHERE user_id IS NULL
            `);
            
            if (usersWithoutId[0].count > 0) {
                console.log(`🔧 Found ${usersWithoutId[0].count} users without user_id, assigning...`);
                await assignUserIdsToExistingUsers();
                results.usersTable.details.push(`Assigned user_id to ${usersWithoutId[0].count} users`);
            } else {
                results.usersTable.details.push('All users already have user_id');
            }
            
            results.usersTable.success = true;
            results.usersTable.message = 'Users table schema fixed successfully';
            
        } catch (error) {
            console.error('❌ Error fixing users table:', error);
            results.usersTable.success = false;
            results.usersTable.message = 'Failed to fix users table: ' + error.message;
        }
        
        // Fix Projects table - add project_id column if missing
        try {
            console.log('🔧 Checking Projects table...');
            
            // Check if project_id column exists
            const projectIdColumnExists = await dbHelpers.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'projects' AND column_name = 'project_id'
            `);
            
            if (projectIdColumnExists.length === 0) {
                console.log('🔧 Adding project_id column to projects table...');
                await dbHelpers.query(`
                    ALTER TABLE projects ADD COLUMN project_id VARCHAR(20)
                `);
                results.projectsTable.details.push('Added project_id column');
                
                // Generate project IDs for existing projects
                const projects = await dbHelpers.query(`
                    SELECT id FROM projects WHERE project_id IS NULL OR project_id = ''
                `);
                
                console.log(`🔧 Found ${projects.length} projects without project_id, generating...`);
                let generatedCount = 0;
                
                for (const project of projects) {
                    try {
                        const projectId = await generateProjectId();
                        await dbHelpers.run(`
                            UPDATE projects SET project_id = $1 WHERE id = $2
                        `, [projectId, project.id]);
                        generatedCount++;
                    } catch (error) {
                        console.error('❌ Failed to generate project ID for:', project.id, error.message);
                    }
                }
                
                results.projectsTable.details.push(`Generated project_id for ${generatedCount} projects`);
            } else {
                results.projectsTable.details.push('project_id column already exists');
            }
            
            results.projectsTable.success = true;
            results.projectsTable.message = 'Projects table schema fixed successfully';
            
        } catch (error) {
            console.error('❌ Error fixing projects table:', error);
            results.projectsTable.success = false;
            results.projectsTable.message = 'Failed to fix projects table: ' + error.message;
        }
        
        console.log('✅ Database schema fix completed');
        res.json({
            success: true,
            message: 'Database schema fix completed',
            results
        });
        
    } catch (error) {
        console.error('❌ Error fixing database schema:', error);
        res.status(500).json({ error: 'Failed to fix database schema: ' + error.message });
    }
});

// Check database schema (admin only)
app.get('/debug/schema', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        console.log('🔍 Checking database schema...');
        
        // Check users table schema
        const usersColumns = await dbHelpers.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        // Check projects table schema
        const projectsColumns = await dbHelpers.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'projects' 
            ORDER BY ordinal_position
        `);
        
        // Check sample data
        const sampleUsers = await dbHelpers.query(`
            SELECT id, user_id, email, name, role, license 
            FROM users 
            LIMIT 5
        `);
        
        const sampleProjects = await dbHelpers.query(`
            SELECT id, user_id, project_id, name, status 
            FROM projects 
            LIMIT 5
        `);
        
        res.json({
            success: true,
            schema: {
                users: {
                    columns: usersColumns,
                    sampleData: sampleUsers
                },
                projects: {
                    columns: projectsColumns,
                    sampleData: sampleProjects
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Error checking database schema:', error);
        res.status(500).json({ error: 'Failed to check database schema: ' + error.message });
    }
});


// Create project for user (admin only)
app.post('/admin/projects/create', requireAuth, async (req, res) => {
    try {
        console.log('🔧 Admin creating project for user');
        console.log('🔧 Request body:', req.body);
        
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            console.log('❌ Access denied - not admin');
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { 
            name, fileName, wordCount, breakdown, subtotal, 
            projectManagementCost, total, projectType, multiplier, 
            notes, userId 
        } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        // Verify user exists
        const user = await dbHelpers.get('SELECT id, name, email FROM users WHERE id = $1', [userId]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log('✅ User found:', user.name, user.email);
        
        // Generate project ID
        const projectId = crypto.randomUUID();
        const humanReadableId = await generateProjectId();
        
        console.log('🔢 Generated project ID:', humanReadableId);
        
        // Create project
        await dbHelpers.run(`
            INSERT INTO projects (
                id, user_id, name, file_name, word_count, breakdown, 
                subtotal, project_management_cost, total, status, project_type, 
                multiplier, notes, project_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
        `, [
            projectId, userId, name, fileName, wordCount, 
            JSON.stringify(breakdown), subtotal, projectManagementCost, total, 'quote_generated', 
            projectType || 'fusion', multiplier || 1.0, notes || '', humanReadableId
        ]);
        
        console.log('✅ Project created successfully for user');
        
        // Send email notification to user
        try {
            await emailService.sendProjectCreatedEmail(user.email, user.name, name, humanReadableId, total);
            console.log('✅ Project creation email sent to user');
        } catch (emailError) {
            console.error('❌ Failed to send project creation email:', emailError);
        }
        
        // Send admin notification
        try {
            await emailService.sendProjectCreatedNotificationToAdmin({
                projectName: name,
                fileName: fileName,
                wordCount: parseInt(wordCount),
                projectType: projectType || 'fusion',
                total: parseFloat(total),
                userEmail: user.email,
                userName: user.name || user.email,
                projectId: humanReadableId,
                breakdown: breakdown
            });
            console.log('✅ Admin notification sent for project creation');
        } catch (adminEmailError) {
            console.error('❌ Failed to send admin notification:', adminEmailError);
        }
        
        res.json({ 
            success: true, 
            message: 'Project created successfully',
            projectId: humanReadableId,
            project: {
                id: projectId,
                name,
                fileName,
                wordCount,
                total,
                status: 'quote_generated',
                projectId: humanReadableId
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating project for user:', error);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Search projects by project ID (admin only)
app.get('/admin/projects/search/:projectId', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Search endpoint called');
        console.log('🔍 Request params:', req.params);
        console.log('🔍 Request user:', { id: req.user.id, email: req.user.email, role: req.user.role });
        
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            console.log('❌ Access denied - not admin');
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { projectId } = req.params;
        console.log('🔍 Searching for project with ID:', projectId);
        
        const projects = await dbHelpers.query(`
            SELECT p.*, u.name as user_name, u.email as user_email 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.project_id ILIKE $1
            ORDER BY p.created_at DESC
        `, [`%${projectId}%`]);
        
        console.log('📋 Search results:', projects.length, 'projects found');
        
        // Parse JSON fields for frontend
        const processedProjects = projects.map(project => {
            try {
                return {
                    ...project,
                    breakdown: project.breakdown ? JSON.parse(project.breakdown) : [],
                    created_at: project.created_at,
                    createdAt: project.created_at,
                    fileName: project.file_name,
                    wordCount: project.word_count,
                    projectType: project.project_type,
                    projectManagementCost: project.project_management_cost,
                    subtotal: project.subtotal,
                    translatedFileName: project.translated_file_name,
                    userName: project.user_name,
                    userEmail: project.user_email,
                    projectId: project.project_id
                };
            } catch (error) {
                console.error('❌ Error parsing search result:', error, project);
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
                    translatedFileName: project.translated_file_name,
                    userName: project.user_name,
                    userEmail: project.user_email,
                    projectId: project.project_id
                };
            }
        });
        
        res.json(processedProjects);
    } catch (error) {
        console.error('❌ Error searching projects:', error);
        res.status(500).json({ error: 'Failed to search projects' });
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
                    translatedFileName: project.translated_file_name, // Add alias for frontend compatibility
                    projectId: project.project_id // Add alias for frontend compatibility
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
                    translatedFileName: project.translated_file_name,
                    projectId: project.project_id
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
        
        // Try to insert with all columns first
        try {
            // Generate a human-readable project ID
            const humanReadableId = await generateProjectId();
            
            await dbHelpers.run(`
                INSERT INTO projects (
                    id, user_id, name, file_name, word_count, breakdown, 
                    subtotal, project_management_cost, total, status, project_type, multiplier, notes, project_id, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
            `, [
                projectId, req.user.id, projectNameToUse, fileName, wordCount, 
                JSON.stringify(breakdown), subtotal, projectManagementCost, total, 'quote_generated', 
                projectType || 'fusion', multiplier || 1.0, notes || '', humanReadableId
            ]);
        } catch (error) {
            console.log('🔍 Initial insert failed:', error.message);
            
            // If columns don't exist, try to add them and retry
            if (error.message.includes('column "subtotal"') || error.message.includes('column "project_management_cost"') || error.message.includes('column "project_id"') || error.message.includes('column "translated_file_path"')) {
                console.log('🔧 Database columns missing, attempting to add them...');
                // Add missing columns with error handling for existing columns
                const columnsToAdd = [
                    { name: 'subtotal', type: 'REAL DEFAULT 0' },
                    { name: 'project_management_cost', type: 'REAL DEFAULT 500' },
                    { name: 'translated_file_path', type: 'TEXT' },
                    { name: 'project_id', type: 'VARCHAR(20)' }
                ];
                
                for (const column of columnsToAdd) {
                    try {
                        await dbHelpers.query(`
                            ALTER TABLE projects 
                            ADD COLUMN ${column.name} ${column.type}
                        `);
                        console.log(`✅ Added ${column.name} column`);
                    } catch (columnError) {
                        if (columnError.message.includes('already exists')) {
                            console.log(`ℹ️ ${column.name} column already exists`);
                        } else {
                            console.error(`❌ Error adding ${column.name} column:`, columnError.message);
                            throw columnError;
                        }
                    }
                }
                
                // Generate project ID after adding the column
                const humanReadableId = await generateProjectId();
                console.log('✅ Generated project ID after schema fix:', humanReadableId);
                
                // Retry the insert with a simple approach - try without project_id first if it fails
                try {
                    await dbHelpers.run(`
                        INSERT INTO projects (
                            id, user_id, name, file_name, word_count, breakdown, 
                            subtotal, project_management_cost, total, status, project_type, multiplier, notes, project_id, created_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
                    `, [
                        projectId, req.user.id, projectNameToUse, fileName, wordCount, 
                        JSON.stringify(breakdown), subtotal, projectManagementCost, total, 'quote_generated', 
                        projectType || 'fusion', multiplier || 1.0, notes || '', humanReadableId
                    ]);
                    console.log('✅ Project created successfully after schema fix');
                } catch (retryInsertError) {
                    console.log('🔍 Retry insert failed, trying without project_id:', retryInsertError.message);
                    
                    // If project_id still fails, try without it
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
                    
                    // Update the project_id separately
                    await dbHelpers.run(`
                        UPDATE projects 
                        SET project_id = $1 
                        WHERE id = $2
                    `, [humanReadableId, projectId]);
                    
                    console.log('✅ Project created successfully with separate project_id update');
                }
            } else {
                console.error('❌ Unexpected database error:', error.message);
                throw error;
            }
        }
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [projectId]);
        
        // Send project creation email to user
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
                console.log('✅ Project creation email sent to user:', user.email);
            }
        } catch (emailError) {
            console.error('❌ Failed to send project creation email to user:', emailError);
            // Don't fail the project creation if email fails
        }
        
        // Send project creation notification to super admin
        try {
            await emailService.sendProjectCreatedNotificationToAdmin({
                projectName: projectNameToUse,
                fileName,
                wordCount: parseInt(wordCount),
                projectType: projectType || 'fusion',
                total: parseFloat(total),
                userEmail: req.user.email,
                userName: req.user.name || req.user.email,
                projectId: projectId,
                breakdown: breakdown
            });
            console.log('✅ Project creation notification sent to super admin');
        } catch (adminEmailError) {
            console.error('❌ Failed to send project creation notification to admin:', adminEmailError);
            // Don't fail the project creation if admin email fails
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
        
        console.log('🔍 Project lookup result:', project);
        
        if (!project) {
            console.log('❌ Project not found or access denied for:', { projectId: id, userId: req.user.id });
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
        
        console.log('🔍 Project lookup result:', project);
        
        if (!project) {
            console.log('❌ Project not found or access denied for:', { projectId: id, userId: req.user.id });
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        
        // Update project status to submitted
        await dbHelpers.run('UPDATE projects SET status = $1, submitted_at = CURRENT_TIMESTAMP WHERE id = $2', ['submitted', id]);
        
        // Send admin notification for project submission
        try {
            await emailService.sendProjectCreatedNotificationToAdmin({
                projectName: project.name,
                fileName: project.file_name,
                wordCount: project.word_count,
                projectType: project.project_type || 'fusion',
                total: project.total,
                userEmail: req.user.email,
                userName: req.user.name || req.user.email,
                projectId: project.project_id || project.id,
                breakdown: project.breakdown ? JSON.parse(project.breakdown) : []
            });
            console.log('✅ Project submission notification sent to admin');
        } catch (adminEmailError) {
            console.error('❌ Failed to send project submission notification to admin:', adminEmailError);
            // Don't fail the project submission if admin email fails
        }
        
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
            const basePrice = parseFloat(languagePricing[language]) || 25;
            // Convert cents per word to dollars (divide by 100)
            const cost = (wordCount * basePrice * effectiveMultiplier) / 100;
            
            console.log(`🔍 ${language}: basePrice=${basePrice} cents, wordCount=${wordCount}, cost=${cost.toFixed(2)} dollars`);
            
            breakdown.push({
                language: language,
                cost: cost.toFixed(2)
            });
            
            subtotal += cost;
        });

        // Get PM percentage from settings (default 1%)
        const pmSetting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['pm_percentage']);
        const pmPercentage = pmSetting ? parseFloat(pmSetting.value) : 1.0;
        
        // Calculate project management cost: percentage of subtotal, capped at $500
        const percentageAmount = subtotal * (pmPercentage / 100);
        const projectManagementCost = Math.min(percentageAmount, 500.00);
        const total = subtotal + projectManagementCost;

        console.log('💰 Final calculation:', {
            wordCount,
            subtotal: subtotal.toFixed(2),
            pmPercentage: `${pmPercentage}%`,
            pmCalculation: `${pmPercentage}% of $${subtotal.toFixed(2)} = $${percentageAmount.toFixed(2)}`,
            projectManagementCost: projectManagementCost.toFixed(2) + ' (capped at $500)',
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
            pmPercentage: pmPercentage,
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
                    translatedFileName: project.translated_file_name, // Add alias for frontend compatibility
                    userName: project.user_name, // Add alias for frontend compatibility
                    userEmail: project.user_email, // Add alias for frontend compatibility
                    projectId: project.project_id // Add alias for frontend compatibility
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
                    translatedFileName: project.translated_file_name,
                    userName: project.user_name, // Add alias for frontend compatibility
                    userEmail: project.user_email, // Add alias for frontend compatibility
                    projectId: project.project_id // Add alias for frontend compatibility
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
        const basicUsers = await dbHelpers.query('SELECT id, user_id, email, name, role, license, parent_user_id, created_at FROM users ORDER BY created_at DESC');
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

// Update user license (admin only)
app.put('/admin/users/update-license', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { userId, license } = req.body;
        console.log('🔍 Update license request:', { userId, license, adminId: req.user.id });
        
        if (!userId || !license) {
            return res.status(400).json({ error: 'User ID and license are required' });
        }
        
        // Validate license value
        if (!['Free', 'Professional'].includes(license)) {
            return res.status(400).json({ error: 'Invalid license type. Must be Free or Professional' });
        }
        
        // Check if user exists
        const existingUser = await dbHelpers.get('SELECT * FROM users WHERE id = $1', [userId]);
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Update user license
        await dbHelpers.run(`
            UPDATE users SET license = $1 WHERE id = $2
        `, [license, userId]);
        
        console.log('✅ User license updated successfully:', { userId, license });
        res.json({ 
            success: true, 
            message: 'User license updated successfully',
            userId: userId,
            license: license
        });
        
    } catch (error) {
        console.error('❌ Error updating user license:', error);
        res.status(500).json({ error: 'Failed to update user license: ' + error.message });
    }
});

// Get sub-account projects for main user
app.get('/api/sub-account-projects', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // Get all sub-users for this main user
        const subUsers = await dbHelpers.query(`
            SELECT id, user_id, email, name 
            FROM users 
            WHERE parent_user_id = $1
        `, [userId]);
        
        if (subUsers.length === 0) {
            return res.json({ 
                success: true, 
                projects: [], 
                subUsers: [] 
            });
        }
        
        // Get all project IDs for sub-users
        const subUserIds = subUsers.map(sub => sub.id);
        const placeholders = subUserIds.map((_, index) => `$${index + 1}`).join(',');
        
        const query = `
            SELECT 
                p.id,
                p.name,
                p.status,
                p.total,
                p.created_at,
                p.project_type,
                p.user_id,
                u.name as user_name,
                u.user_id as user_display_id
            FROM projects p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id IN (${placeholders})
            ORDER BY p.created_at DESC
        `;
        
        const projects = await dbHelpers.query(query, subUserIds);
        
        res.json({
            success: true,
            projects: projects,
            subUsers: subUsers
        });
        
    } catch (error) {
        console.error('❌ Error fetching sub-account projects:', error);
        console.error('❌ Error stack:', error.stack);
        console.error('❌ Error details:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint
        });
        res.status(500).json({ error: 'Failed to fetch sub-account projects: ' + error.message });
    }
});

// Simple test endpoint to check if user has sub-accounts
app.get('/api/has-sub-accounts', requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('🔍 Checking if user has sub-accounts:', userId);
        
        const subUsers = await dbHelpers.query(`
            SELECT id, user_id, email, name 
            FROM users 
            WHERE parent_user_id = $1
        `, [userId]);
        
        console.log('🔍 Sub-users found:', subUsers.length);
        
        res.json({
            success: true,
            hasSubAccounts: subUsers.length > 0,
            subUsersCount: subUsers.length
        });
        
    } catch (error) {
        console.error('❌ Error checking sub-accounts:', error);
        res.status(500).json({ error: 'Failed to check sub-accounts: ' + error.message });
    }
});

// Get user details with sub-users (admin only)
app.get('/admin/users/:userId', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { userId } = req.params;

        // Get main user details
        const user = await dbHelpers.get(`
            SELECT id, user_id, email, name, role, license, parent_user_id, created_at
            FROM users 
            WHERE id = $1
        `, [userId]);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get sub-users if this user is a parent
        const subUsers = await dbHelpers.query(`
            SELECT id, user_id, email, name, role, license, created_at
            FROM users 
            WHERE parent_user_id = $1
            ORDER BY created_at DESC
        `, [userId]);

        res.json({
            success: true,
            user: {
                ...user,
                subUsers: subUsers
            }
        });

    } catch (error) {
        console.error('❌ Error getting user details:', error);
        res.status(500).json({ error: 'Failed to get user details: ' + error.message });
    }
});

// Add sub-user (admin only)
app.post('/admin/users/:parentUserId/sub-users', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { parentUserId } = req.params;
        const { subUserId } = req.body;

        console.log('🔍 Add sub-user request:', { parentUserId, subUserId });

        if (!subUserId) {
            return res.status(400).json({ error: 'Sub-user ID is required' });
        }

        // Check if parent user exists by user_id (convert to integer)
        const parentUser = await dbHelpers.get(`
            SELECT id, email, license FROM users WHERE user_id = $1
        `, [parseInt(parentUserId)]);

        console.log('🔍 Parent user found:', parentUser);

        if (!parentUser) {
            return res.status(404).json({ error: 'Parent user not found' });
        }

        // Check if sub-user exists and is not already a sub-user (convert to integer)
        const subUser = await dbHelpers.get(`
            SELECT id, email, license, parent_user_id FROM users WHERE user_id = $1
        `, [parseInt(subUserId)]);

        console.log('🔍 Sub-user found:', subUser);

        if (!subUser) {
            return res.status(404).json({ error: 'Sub-user not found' });
        }

        if (subUser.parent_user_id) {
            return res.status(400).json({ error: 'User is already a sub-user of another account' });
        }

        // Update sub-user to have parent_user_id and change license to Professional - Sub Account
        let newLicense = 'Professional - Sub Account';
        console.log('🔍 Sub-user current license:', JSON.stringify(subUser.license));
        console.log('🔍 License type:', typeof subUser.license);
        console.log('🔄 Changing license from', subUser.license, 'to Professional - Sub Account');

        await dbHelpers.run(`
            UPDATE users 
            SET parent_user_id = $1, license = $2
            WHERE id = $3
        `, [parentUser.id, newLicense, subUser.id]);

        console.log(`✅ Added sub-user ${subUser.email} under parent ${parentUser.email}`);
        console.log(`✅ Sub-user license set to: ${newLicense}`);
        res.json({ 
            success: true, 
            message: 'Sub-user added successfully',
            subUser: {
                ...subUser,
                license: newLicense,
                parent_user_id: parentUserId
            }
        });

    } catch (error) {
        console.error('❌ Error adding sub-user:', error);
        console.error('❌ Error details:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to add sub-user: ' + error.message });
    }
});

// Remove sub-user (admin only)
app.delete('/admin/users/:parentUserId/sub-users/:subUserId', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { parentUserId, subUserId } = req.params;

        // Get parent user by user_id first (convert to integer)
        const parentUser = await dbHelpers.get(`
            SELECT id FROM users WHERE user_id = $1
        `, [parseInt(parentUserId)]);
        
        if (!parentUser) {
            return res.status(404).json({ error: 'Parent user not found' });
        }
        
        // Get sub-user details by user_id first, then check parent relationship (convert to integer)
        const subUserByUserId = await dbHelpers.get(`
            SELECT id, email, license, parent_user_id FROM users WHERE user_id = $1
        `, [parseInt(subUserId)]);
        
        if (!subUserByUserId) {
            return res.status(404).json({ error: 'Sub-user not found' });
        }
        
        if (subUserByUserId.parent_user_id !== parentUser.id) {
            return res.status(404).json({ error: 'Sub-user not found under this parent' });
        }
        
        const subUser = subUserByUserId;

        // Restore license to Free when removing sub-user
        let newLicense = 'Free';
        console.log('🔄 Removing sub-user, restoring license to Free');

        // Remove parent_user_id and restore license
        await dbHelpers.run(`
            UPDATE users 
            SET parent_user_id = NULL, license = $1
            WHERE id = $2
        `, [newLicense, subUser.id]);

        console.log(`✅ Removed sub-user ${subUser.email} from parent`);
        res.json({ 
            success: true, 
            message: 'Sub-user removed successfully' 
        });

    } catch (error) {
        console.error('❌ Error removing sub-user:', error);
        res.status(500).json({ error: 'Failed to remove sub-user: ' + error.message });
    }
});

// Create regular user (admin only)
app.post('/admin/users/create', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { email, name, tempPassword } = req.body;
        console.log('🔍 Create user request:', { email, name, adminId: req.user.id });
        
        if (!email || !name || !tempPassword) {
            return res.status(400).json({ error: 'Email, name, and temporary password are required' });
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        
        // Password validation
        if (tempPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }
        
        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT * FROM users WHERE email = $1', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        
        // Hash the temporary password
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        
        // Create new regular user
        const userId = uuidv4();
        const userDisplayId = await generateUserId();
        await dbHelpers.run(`
            INSERT INTO users (id, user_id, email, name, password_hash, role, license, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        `, [userId, userDisplayId, email, name, hashedPassword, 'user', 'Free']);
        
        const newUser = await dbHelpers.get('SELECT * FROM users WHERE id = $1', [userId]);
        
        console.log('✅ Regular user created successfully:', newUser);
        res.json({ 
            success: true, 
            message: 'User created successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                role: newUser.role
            }
        });
        
    } catch (error) {
        console.error('❌ Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user: ' + error.message });
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

// Delete project (super admin only)
app.delete('/admin/projects/:id', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const { id } = req.params;
        
        console.log('🗑️ Deleting project:', { projectId: id, superAdminId: req.user.id });
        
        // Check if project exists
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = $1', [id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Delete the project
        await dbHelpers.run('DELETE FROM projects WHERE id = $1', [id]);
        
        console.log('✅ Project deleted successfully:', { projectId: id });
        res.json({ success: true, message: 'Project deleted successfully' });
        
    } catch (error) {
        console.error('❌ Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project: ' + error.message });
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
        
        // Validate that savedFile.filePath exists
        if (!savedFile || !savedFile.filePath) {
            console.error('❌ FileManager did not return valid filePath:', savedFile);
            throw new Error('Failed to save file - no file path returned');
        }
        
        console.log('🔍 File path to save in database:', savedFile.filePath);
        
        // Save the translated file information to the database
        console.log('🔍 Updating database with file information...');
        console.log('🔍 Update parameters:', {
            fileName: req.file.originalname,
            filePath: savedFile.filePath,
            projectId: id
        });
        
        try {
            const updateResult = await dbHelpers.run(`
                UPDATE projects 
                SET translated_file_name = $1, translated_file_path = $2, status = $3 
                WHERE id = $4
            `, [req.file.originalname, savedFile.filePath, 'completed', id]);
            
            console.log('✅ Database updated successfully');
        } catch (dbError) {
            console.error('❌ Database update failed:', dbError);
            console.error('❌ Error message:', dbError.message);
            
            // Check if translated_file_path column exists
            if (dbError.message.includes('column "translated_file_path"')) {
                console.log('🔧 translated_file_path column missing, attempting to add it...');
                try {
                    await dbHelpers.query(`
                        ALTER TABLE projects 
                        ADD COLUMN translated_file_path TEXT
                    `);
                    console.log('✅ Added translated_file_path column');
                    
                    // Retry the update
                    await dbHelpers.run(`
                        UPDATE projects 
                        SET translated_file_name = $1, translated_file_path = $2, status = $3 
                        WHERE id = $4
                    `, [req.file.originalname, savedFile.filePath, 'completed', id]);
                    
                    console.log('✅ Database updated successfully after adding column');
                } catch (retryError) {
                    console.error('❌ Failed to add column and retry:', retryError);
                    throw new Error('Database schema issue - could not save file path');
                }
            } else {
                throw dbError;
            }
        }
        
        // Verify the update was successful
        const verifyProject = await dbHelpers.get('SELECT translated_file_path FROM projects WHERE id = $1', [id]);
        if (!verifyProject.translated_file_path) {
            console.error('❌ Database update failed - translated_file_path is still null');
            throw new Error('Database update failed - file path not saved');
        }
        
        console.log('✅ Database verification successful - file path saved:', verifyProject.translated_file_path);
        
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
            
            // Validate that translated_file_path exists
            if (!project.translated_file_path) {
                console.error('❌ translated_file_path is null or undefined for project:', project.id);
                return res.status(500).json({ 
                    error: 'Translated file path not found in database. Please contact admin to re-upload the file.' 
                });
            }
            
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
            SET translated_file_name = $1, translated_file_path = $2, status = $3 
            WHERE id = $4
        `, [req.file.originalname, req.file.path, 'completed', id]);
        
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
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['languages', JSON.stringify(languages)]);
            console.log('✅ Languages settings updated successfully');
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for languages update');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['languages', JSON.stringify(languages)]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['languages']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['languages', JSON.stringify(languages)]);
                }
                console.log('✅ Languages settings updated using fallback method');
            } catch (fallbackError) {
                console.error('❌ Failed to update languages settings:', fallbackError);
                throw fallbackError;
            }
        }
        
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
        
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['languages', JSON.stringify(defaultLanguages)]);
            console.log('✅ Default languages reset successfully');
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for languages reset');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['languages', JSON.stringify(defaultLanguages)]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['languages']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['languages', JSON.stringify(defaultLanguages)]);
                }
                console.log('✅ Default languages reset using fallback method');
            } catch (fallbackError) {
                console.error('❌ Failed to reset languages settings:', fallbackError);
                throw fallbackError;
            }
        }
        
        res.json({ success: true, languages: defaultLanguages });
    } catch (error) {
        console.error('Error resetting languages:', error);
        res.status(500).json({ error: 'Failed to reset languages' });
    }
});

// Admin add language endpoint
app.post('/admin/languages/add', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { languageName, price } = req.body;
        
        if (!languageName || !price) {
            return res.status(400).json({ error: 'Language name and price are required' });
        }
        
        if (price < 0.01 || price > 999.99) {
            return res.status(400).json({ error: 'Price must be between 0.01 and 999.99 cents' });
        }
        
        // Get current languages
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        
        // Check if language already exists
        if (languages[languageName]) {
            return res.status(400).json({ error: 'Language already exists' });
        }
        
        // Add new language
        languages[languageName] = price;
        
        // Save updated languages
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['languages', JSON.stringify(languages)]);
            console.log('✅ New language added successfully:', languageName, price);
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for adding language');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['languages', JSON.stringify(languages)]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['languages']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['languages', JSON.stringify(languages)]);
                }
                console.log('✅ New language added using fallback method:', languageName, price);
            } catch (fallbackError) {
                console.error('❌ Failed to add language:', fallbackError);
                throw fallbackError;
            }
        }
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error adding language:', error);
        res.status(500).json({ error: 'Failed to add language' });
    }
});

// Admin delete language endpoint
app.delete('/admin/languages/:languageName', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { languageName } = req.params;
        
        if (!languageName) {
            return res.status(400).json({ error: 'Language name is required' });
        }
        
        // Get current languages
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        
        // Check if language exists
        if (!languages[languageName]) {
            return res.status(404).json({ error: 'Language not found' });
        }
        
        // Check if it's a default language (prevent deletion of default languages)
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
            "Hindi": 35,
            "Bengali": 35,
            "Urdu": 35,
            "Tamil": 35,
            "Telugu": 35,
            "Marathi": 35,
            "Gujarati": 35,
            "Punjabi": 35,
            "Kannada": 35,
            "Malayalam": 35,
            "Odia": 35,
            "Assamese": 35,
            "Nepali": 35,
            "Sinhala": 35,
            "Burmese": 35,
            "Khmer": 35,
            "Lao": 35,
            "Mongolian": 40,
            "Tibetan": 45,
            "Uyghur": 40,
            "Kazakh": 35,
            "Kyrgyz": 35,
            "Tajik": 35,
            "Turkmen": 35,
            "Uzbek": 35,
            "Azerbaijani": 35,
            "Georgian": 40,
            "Armenian": 40,
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
        
        if (defaultLanguages[languageName]) {
            return res.status(400).json({ error: 'Cannot delete default language' });
        }
        
        // Delete the language
        delete languages[languageName];
        
        // Save updated languages
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['languages', JSON.stringify(languages)]);
            console.log('✅ Language deleted successfully:', languageName);
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for deleting language');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['languages', JSON.stringify(languages)]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['languages']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['languages', JSON.stringify(languages)]);
                }
                console.log('✅ Language deleted using fallback method:', languageName);
            } catch (fallbackError) {
                console.error('❌ Failed to delete language:', fallbackError);
                throw fallbackError;
            }
        }
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error deleting language:', error);
        res.status(500).json({ error: 'Failed to delete language' });
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
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['multiplier', multiplier.toString()]);
            console.log('✅ Multiplier settings updated successfully');
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for multiplier update');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['multiplier', multiplier.toString()]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['multiplier']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['multiplier', multiplier.toString()]);
                }
                console.log('✅ Multiplier settings updated using fallback method');
            } catch (fallbackError) {
                console.error('❌ Failed to update multiplier settings:', fallbackError);
                throw fallbackError;
            }
        }
        
        res.json({ success: true, multiplier });
    } catch (error) {
        console.error('Error updating multiplier:', error);
        res.status(500).json({ error: 'Failed to update multiplier' });
    }
});

// Get PM percentage setting
app.get('/admin/pm-percentage', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = $1', ['pm_percentage']);
        const percentage = setting ? parseFloat(setting.value) : 1.0; // Default 1%
        res.json({ percentage });
    } catch (error) {
        console.error('Error loading PM percentage:', error);
        res.status(500).json({ error: 'Failed to load PM percentage' });
    }
});

// Update PM percentage setting
app.put('/admin/pm-percentage', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { percentage } = req.body;
        
        if (percentage < 0 || percentage > 100) {
            return res.status(400).json({ error: 'Percentage must be between 0 and 100' });
        }
        
        try {
            await dbHelpers.run(`
                INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, ['pm_percentage', percentage.toString()]);
            console.log('✅ PM percentage settings updated successfully');
        } catch (error) {
            console.log('⚠️ ON CONFLICT failed, using fallback method for PM percentage update');
            // Fallback for databases without proper constraints
            try {
                await dbHelpers.run(`
                    UPDATE settings SET value = $2, updated_at = CURRENT_TIMESTAMP WHERE key = $1
                `, ['pm_percentage', percentage.toString()]);
                const result = await dbHelpers.get('SELECT COUNT(*) as count FROM settings WHERE key = $1', ['pm_percentage']);
                if (result.count === 0) {
                    await dbHelpers.run(`
                        INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
                    `, ['pm_percentage', percentage.toString()]);
                }
                console.log('✅ PM percentage settings updated using fallback method');
            } catch (fallbackError) {
                console.error('❌ Failed to update PM percentage settings:', fallbackError);
                throw fallbackError;
            }
        }
        
        res.json({ success: true, percentage });
    } catch (error) {
        console.error('Error updating PM percentage:', error);
        res.status(500).json({ error: 'Failed to update PM percentage' });
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

// Profile endpoints
app.get('/profile', requireAuth, async (req, res) => {
    try {
        console.log('👤 Fetching profile for user:', req.user.email);
        
        const user = await dbHelpers.get('SELECT * FROM users WHERE email = $1', [req.user.email]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Determine role display
        let roleDisplay = 'User';
        if (user.role === 'admin') {
            roleDisplay = 'Admin';
        } else if (user.role === 'super_admin') {
            roleDisplay = 'Super Admin';
        }
        
        const profileData = {
            name: user.name,
            email: user.email,
            company: '', // Company field not in users table
            role: roleDisplay,
            license: user.license || 'Free',
            user_id: user.user_id,
            created_at: user.created_at
        };
        
        console.log('✅ Profile data retrieved:', profileData);
        res.json(profileData);
        
    } catch (error) {
        console.error('❌ Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile: ' + error.message });
    }
});

app.put('/profile/update', requireAuth, async (req, res) => {
    try {
        console.log('👤 Updating profile for user:', req.user.email);
        
        const { name, company } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'Name is required' });
        }
        
        // Only update name since company field doesn't exist in users table
        await dbHelpers.run(
            'UPDATE users SET name = $1 WHERE email = $2',
            [name.trim(), req.user.email]
        );
        
        console.log('✅ Profile updated successfully');
        res.json({ message: 'Profile updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile: ' + error.message });
    }
});

app.put('/profile/change-password', requireAuth, async (req, res) => {
    try {
        console.log('🔐 Changing password for user:', req.user.email);
        
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters long' });
        }
        
        // Verify current password
        const user = await dbHelpers.get('SELECT password FROM users WHERE email = $1', [req.user.email]);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Update password
        await dbHelpers.run(
            'UPDATE users SET password = $1 WHERE email = $2',
            [hashedPassword, req.user.email]
        );
        
        console.log('✅ Password changed successfully');
        res.json({ message: 'Password changed successfully' });
        
    } catch (error) {
        console.error('❌ Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password: ' + error.message });
    }
});

app.get('/notifications/preferences', requireAuth, async (req, res) => {
    try {
        console.log('🔔 Fetching notification preferences for user:', req.user.email);
        
        // For now, return default preferences
        // In the future, this could be stored in a separate table
        const preferences = {
            projectUpdates: true,
            newMessages: true,
            completedProjects: true
        };
        
        console.log('✅ Notification preferences retrieved');
        res.json(preferences);
        
    } catch (error) {
        console.error('❌ Error fetching notification preferences:', error);
        res.status(500).json({ error: 'Failed to fetch notification preferences: ' + error.message });
    }
});

app.put('/notifications/preferences', requireAuth, async (req, res) => {
    try {
        console.log('🔔 Updating notification preferences for user:', req.user.email);
        
        const { projectUpdates, newMessages, completedProjects } = req.body;
        
        // For now, just return success
        // In the future, this could be stored in a separate table
        console.log('✅ Notification preferences updated');
        res.json({ message: 'Notification preferences updated successfully' });
        
    } catch (error) {
        console.error('❌ Error updating notification preferences:', error);
        res.status(500).json({ error: 'Failed to update notification preferences: ' + error.message });
    }
});

// Email Template Management Endpoints

// Get all email templates
app.get('/admin/email-templates', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // First check if table exists
        try {
            await dbHelpers.get('SELECT COUNT(*) as count FROM email_templates');
        } catch (tableError) {
            console.error('Email templates table does not exist:', tableError);
            return res.status(500).json({ error: 'Email templates table not found. Please restart the server.' });
        }
        
        const templates = await dbHelpers.query('SELECT * FROM email_templates ORDER BY name');
        res.json(templates);
    } catch (error) {
        console.error('Error fetching email templates:', error);
        res.status(500).json({ error: 'Failed to fetch email templates' });
    }
});

// Get single email template
app.get('/admin/email-templates/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const template = await dbHelpers.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
        if (!template) {
            return res.status(404).json({ error: 'Email template not found' });
        }

        res.json(template);
    } catch (error) {
        console.error('Error fetching email template:', error);
        res.status(500).json({ error: 'Failed to fetch email template' });
    }
});

// Update email template
app.put('/admin/email-templates/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { name, subject, html_content, description, variables, is_active } = req.body;

        if (!name || !subject || !html_content) {
            return res.status(400).json({ error: 'Name, subject, and HTML content are required' });
        }

        await dbHelpers.run(`
            UPDATE email_templates 
            SET name = $1, subject = $2, html_content = $3, description = $4, variables = $5, is_active = $6, updated_at = CURRENT_TIMESTAMP
            WHERE id = $7
        `, [name, subject, html_content, description, variables, is_active, req.params.id]);

        res.json({ success: true, message: 'Email template updated successfully' });
    } catch (error) {
        console.error('Error updating email template:', error);
        res.status(500).json({ error: 'Failed to update email template' });
    }
});

// Initialize email templates (admin only)
app.post('/admin/email-templates/initialize', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        console.log('📧 Manually initializing email templates...');
        await initializeEmailTemplates();
        
        res.json({ success: true, message: 'Email templates initialized successfully' });
    } catch (error) {
        console.error('Error initializing email templates:', error);
        res.status(500).json({ error: 'Failed to initialize email templates' });
    }
});

// Toggle email template status
app.patch('/admin/email-templates/:id/status', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { is_active } = req.body;
        
        if (typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'is_active must be a boolean value' });
        }

        await dbHelpers.run(`
            UPDATE email_templates 
            SET is_active = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [is_active, req.params.id]);

        res.json({ success: true, message: 'Email template status updated successfully' });
    } catch (error) {
        console.error('Error updating email template status:', error);
        res.status(500).json({ error: 'Failed to update email template status' });
    }
});

// Test email template
app.post('/admin/email-templates/:id/test', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const template = await dbHelpers.get('SELECT * FROM email_templates WHERE id = $1', [req.params.id]);
        if (!template) {
            return res.status(404).json({ error: 'Email template not found' });
        }

        const { testEmail, variables } = req.body;
        if (!testEmail) {
            return res.status(400).json({ error: 'Test email address is required' });
        }

        // Replace variables in template
        let subject = template.subject;
        let htmlContent = template.html_content;

        if (variables) {
            Object.keys(variables).forEach(key => {
                const regex = new RegExp(`{{${key}}}`, 'g');
                subject = subject.replace(regex, variables[key]);
                htmlContent = htmlContent.replace(regex, variables[key]);
            });
        }

        // Send test email
        const messageData = {
            from: `VerbiForge <${process.env.FROM_EMAIL || 'noreply@verbiforge.com'}>`,
            to: testEmail,
            subject: subject,
            html: htmlContent
        };

        if (emailService.isConfigured && emailService.mg) {
            const response = await emailService.mg.messages.create(emailService.domain, messageData);
            res.json({ success: true, messageId: response.id, message: 'Test email sent successfully' });
        } else {
            res.json({ success: false, message: 'Email service not configured - test email logged but not sent' });
        }
    } catch (error) {
        console.error('Error sending test email:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

// Theme management routes removed

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
            'POST /api/admin/save-theme',
            'GET /api/admin/get-theme',
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
