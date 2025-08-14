require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
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

// File upload configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(dbDir, 'uploads');
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

// Database setup
const dbDir = process.env.NODE_ENV === 'production' 
    ? '/opt/render/project/src/data' 
    : path.join(__dirname, 'data');

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'verbiforge.db');
const db = new sqlite3.Database(dbPath);

// Database helpers
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
        
        // Always ensure default settings exist (INSERT OR IGNORE will not overwrite existing)
        console.log('📝 Ensuring default settings exist...');
        
        // Insert default settings (will not overwrite if they exist)
        await dbHelpers.run(`
            INSERT OR IGNORE INTO settings (key, value) VALUES 
            ('languages', '{"English": 25, "Arabic": 50, "Chinese (Simplified)": 35, "Dutch": 40, "French": 35, "German": 45, "Portuguese (Brazil)": 35, "Portuguese (Portugal)": 35, "Spanish (Latin America)": 35, "Spanish (Spain)": 35, "Italian": 40, "Japanese": 45, "Korean": 40, "Russian": 35, "Turkish": 35, "Vietnamese": 30, "Thai": 35, "Indonesian": 30, "Malay": 30, "Filipino": 30, "Hindi": 25, "Bengali": 25, "Urdu": 25, "Persian": 35, "Hebrew": 40, "Greek": 40, "Polish": 35, "Czech": 35, "Hungarian": 35, "Romanian": 35, "Bulgarian": 35, "Croatian": 35, "Serbian": 35, "Slovak": 35, "Slovenian": 35, "Estonian": 40, "Latvian": 40, "Lithuanian": 40, "Finnish": 45, "Swedish": 45, "Norwegian": 45, "Danish": 45, "Icelandic": 50, "Catalan": 35, "Basque": 45, "Galician": 35, "Welsh": 45, "Irish": 45, "Scottish Gaelic": 50, "Maltese": 45, "Luxembourgish": 50, "Faroese": 55, "Greenlandic": 60}'),
            ('multiplier', '1.3')
        `);
        console.log('✅ Default settings ensured');
        
        if (!hasExistingData) {
            // Only create admin users if database is empty
            console.log('📝 Database is empty - creating admin users...');
            
            // Create admin users
            await createAdminUsers();
        } else {
            console.log('✅ Preserving existing data - admin users already exist');
        }
        
        console.log('✅ Database initialization completed');
        
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

// Health endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Fixed VerbiForge server is running',
        database: dbPath,
        timestamp: new Date().toISOString()
    });
});

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
        
        const isValid = await bcrypt.compare(password, user.password_hash);
        
        if (!isValid) {
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
            token: user.id
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
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

// File upload and analysis endpoint
app.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { projectType = 'fusion', languages } = req.body;
        
        if (!languages) {
            return res.status(400).json({ error: 'No languages selected' });
        }

        let selectedLanguages;
        try {
            selectedLanguages = JSON.parse(languages);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid languages format' });
        }

        if (!Array.isArray(selectedLanguages) || selectedLanguages.length === 0) {
            return res.status(400).json({ error: 'No languages selected' });
        }
        
        // Get language pricing
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languagePricing = setting ? JSON.parse(setting.value) : {};
        
        console.log('🔍 Language pricing from DB:', languagePricing);
        console.log('🔍 Selected languages:', selectedLanguages);
        
        // Get multiplier
        const multiplierSetting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['multiplier']);
        const multiplier = multiplierSetting ? parseFloat(multiplierSetting.value) : 1.3;
        
        console.log('🔍 Multiplier from DB:', multiplier);
        console.log('🔍 Project type:', projectType);

        // Calculate actual word count from file
        let wordCount = 0;
        try {
            // Check if it's an Excel file
            if (req.file.mimetype.includes('excel') || req.file.mimetype.includes('spreadsheet') || 
                req.file.originalname.endsWith('.xlsx') || req.file.originalname.endsWith('.xls')) {
                
                try {
                    // Parse Excel file properly
                    const workbook = XLSX.readFile(req.file.path);
                    let totalWords = 0;
                    
                    // Iterate through all sheets
                    workbook.SheetNames.forEach(sheetName => {
                        const worksheet = workbook.Sheets[sheetName];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        
                        // Count words in each cell
                        jsonData.forEach(row => {
                            if (Array.isArray(row)) {
                                row.forEach(cell => {
                                    if (cell && typeof cell === 'string') {
                                        const words = cell.split(/\s+/).filter(word => word.length > 0);
                                        totalWords += words.length;
                                    }
                                });
                            }
                        });
                    });
                    
                    wordCount = totalWords;
                    console.log('🔍 Excel file parsed, word count:', wordCount);
                } catch (excelError) {
                    console.error('Error parsing Excel file:', excelError);
                    // Fallback to file size estimation
                    const fileSizeKB = req.file.size / 1024;
                    wordCount = Math.floor(fileSizeKB * 15);
                    console.log('🔍 Using file size estimation, word count:', wordCount);
                }
                
            } else {
                // For text-based files, count actual words
                const fileContent = fs.readFileSync(req.file.path, 'utf8');
                const words = fileContent.split(/\s+/).filter(word => word.length > 0);
                wordCount = words.length;
            }
            
            // Ensure minimum word count
            if (wordCount < 100) {
                wordCount = Math.floor(Math.random() * 5000) + 1000; // Fallback to random
            }
        } catch (error) {
            console.error('Error reading file:', error);
            // Fallback to estimated word count
            wordCount = Math.floor(Math.random() * 5000) + 1000;
        }
        
        // Calculate costs based on project type
        let subtotal = 0;
        const breakdown = [];
        
        // Apply multiplier only for 'pure' project type
        const effectiveMultiplier = projectType === 'pure' ? multiplier : 1.0;
        
        console.log('🔍 Word count:', wordCount);
        console.log('🔍 Effective multiplier:', effectiveMultiplier);
        
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
        
        console.log('🔍 Total subtotal:', subtotal);

        const projectManagementCost = 500;
        const total = subtotal + projectManagementCost;

        res.json({
            fileName: req.file.originalname,
            wordCount: wordCount,
            projectType: projectType,
            multiplier: projectType === 'pure' ? multiplier : 1.0, // Only show multiplier for pure
            breakdown: breakdown,
            subtotal: subtotal.toFixed(2),
            projectManagementCost: projectManagementCost.toFixed(2),
            total: total.toFixed(2),
            tempFileId: req.file.filename
        });

    } catch (error) {
        console.error('Error analyzing file:', error);
        res.status(500).json({ error: 'Failed to analyze file' });
    }
});

// Get multiplier endpoint
app.get('/multiplier', requireAuth, async (req, res) => {
    try {
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['multiplier']);
        const multiplier = setting ? parseFloat(setting.value) : 1.3;
        res.json({ multiplier });
    } catch (error) {
        console.error('Error loading multiplier:', error);
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

// Debug endpoint to check current settings
app.get('/debug/settings', requireAuth, async (req, res) => {
    try {
        const languageSetting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const multiplierSetting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['multiplier']);
        
        const languages = languageSetting ? JSON.parse(languageSetting.value) : {};
        const multiplier = multiplierSetting ? parseFloat(multiplierSetting.value) : 1.3;
        
        res.json({
            languages: languages,
            multiplier: multiplier,
            languageCount: Object.keys(languages).length
        });
    } catch (error) {
        console.error('Error loading debug settings:', error);
        res.status(500).json({ error: 'Failed to load debug settings' });
    }
});

// Contact submission endpoint
app.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, company, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Name, email, subject, and message are required' });
        }
        
        const contactId = uuidv4();
        
        await dbHelpers.run(`
            INSERT INTO contact_submissions (
                id, name, email, phone, company, subject, message, 
                status, is_read, submitted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [contactId, name, email, phone || null, company || null, subject, message, 'new', false]);
        
        res.json({ 
            success: true, 
            message: 'Contact form submitted successfully' 
        });
        
    } catch (error) {
        console.error('Error submitting contact form:', error);
        res.status(500).json({ error: 'Failed to submit contact form' });
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
        console.log('🔍 Project creation request body:', req.body);
        
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
                total, status, project_type, multiplier, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            projectId, req.user.id, projectNameToUse, fileName, wordCount, 
            JSON.stringify(breakdown), total, 'quote_generated', 
            projectType || 'fusion', multiplier || 1.0, notes || ''
        ]);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [projectId]);
        
        console.log('✅ Project created successfully:', project);
        res.json({ success: true, project });
        
    } catch (error) {
        console.error('❌ Error creating project:', error);
        res.status(500).json({ error: 'Failed to create project: ' + error.message });
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

// Get all projects (admin)
app.get('/admin/projects', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const projects = await dbHelpers.query(`
            SELECT p.*, u.name as user_name, u.email as user_email 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        
        res.json(projects);
    } catch (error) {
        console.error('Error loading admin projects:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Update project status (admin)
app.put('/admin/projects/:id/status', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { status } = req.body;
        await dbHelpers.run('UPDATE projects SET status = ? WHERE id = ?', [status, req.params.id]);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true, project });
    } catch (error) {
        console.error('Error updating project status:', error);
        res.status(500).json({ error: 'Failed to update project status' });
    }
});

// Update project ETA (admin)
app.put('/admin/projects/:id/eta', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { eta } = req.body;
        await dbHelpers.run('UPDATE projects SET eta = ? WHERE id = ?', [eta, req.params.id]);
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true, project });
    } catch (error) {
        console.error('Error updating project ETA:', error);
        res.status(500).json({ error: 'Failed to update project ETA' });
    }
});

// Get project details (admin)
app.get('/admin/projects/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        res.json(project);
    } catch (error) {
        console.error('Error loading project:', error);
        res.status(500).json({ error: 'Failed to load project' });
    }
});

// Download project file (admin)
app.get('/admin/projects/:id/download', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // For now, just return the file info
        // In a real app, you'd serve the actual file
        res.json({
            fileName: project.file_name,
            message: 'File download functionality would be implemented here'
        });
    } catch (error) {
        console.error('Error downloading project file:', error);
        res.status(500).json({ error: 'Failed to download project file' });
    }
});

// Upload translated file (admin)
app.post('/admin/projects/:id/upload-translated', requireAuth, upload.single('file'), async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const project = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        // Update project with translated file
        await dbHelpers.run(`
            UPDATE projects 
            SET translated_file_name = ?, status = 'completed' 
            WHERE id = ?
        `, [req.file.originalname, req.params.id]);
        
        const updatedProject = await dbHelpers.get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        
        res.json({ 
            success: true, 
            project: updatedProject,
            message: 'Translated file uploaded successfully' 
        });
    } catch (error) {
        console.error('Error uploading translated file:', error);
        res.status(500).json({ error: 'Failed to upload translated file' });
    }
});

// Get languages (admin)
app.get('/admin/languages', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        res.json(languages);
    } catch (error) {
        console.error('Error loading admin languages:', error);
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Get default languages (admin)
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

// Update languages (admin)
app.put('/admin/languages', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { languages } = req.body;
        await dbHelpers.run(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        `, ['languages', JSON.stringify(languages)]);
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error updating languages:', error);
        res.status(500).json({ error: 'Failed to update languages' });
    }
});

// Add new language (admin)
app.post('/admin/languages/add', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { name, price } = req.body;
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        languages[name] = price;
        
        await dbHelpers.run(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        `, ['languages', JSON.stringify(languages)]);
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error adding language:', error);
        res.status(500).json({ error: 'Failed to add language' });
    }
});

// Delete language (admin)
app.delete('/admin/languages/:name', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const languageName = decodeURIComponent(req.params.name);
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = setting ? JSON.parse(setting.value) : {};
        delete languages[languageName];
        
        await dbHelpers.run(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        `, ['languages', JSON.stringify(languages)]);
        
        res.json({ success: true, languages });
    } catch (error) {
        console.error('Error deleting language:', error);
        res.status(500).json({ error: 'Failed to delete language' });
    }
});

// Reset languages (admin)
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
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        `, ['languages', JSON.stringify(defaultLanguages)]);
        
        res.json({ success: true, languages: defaultLanguages });
    } catch (error) {
        console.error('Error resetting languages:', error);
        res.status(500).json({ error: 'Failed to reset languages' });
    }
});

// Get users (admin)
app.get('/admin/users', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const users = await dbHelpers.query(`
            SELECT id, email, name, role, created_at as createdAt
            FROM users 
            ORDER BY created_at DESC
        `);
        
        res.json(users);
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// Update user (admin)
app.put('/admin/users/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { name, role } = req.body;
        await dbHelpers.run('UPDATE users SET name = ?, role = ? WHERE id = ?', [name, role, req.params.id]);
        
        const user = await dbHelpers.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
        res.json({ success: true, user });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Get admin users (admin)
app.get('/admin/admins', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const admins = await dbHelpers.query(`
            SELECT id, email, name, role, created_at
            FROM users 
            WHERE role = 'admin' OR role = 'super_admin'
            ORDER BY created_at DESC
        `);
        res.json(admins);
    } catch (error) {
        console.error('Error loading admins:', error);
        res.status(500).json({ error: 'Failed to load admins' });
    }
});

// Add admin user (admin)
app.post('/admin/admins', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const { email, name, role } = req.body;
        
        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser) {
            // Update existing user to admin
            await dbHelpers.run('UPDATE users SET role = ? WHERE email = ?', [role || 'admin', email]);
            const updatedUser = await dbHelpers.get('SELECT * FROM users WHERE email = ?', [email]);
            res.json({ success: true, admin: updatedUser });
        } else {
            // Create new admin user
            const userId = uuidv4();
            const hashedPassword = await bcrypt.hash('admin123', 12);
            
            await dbHelpers.run(`
                INSERT INTO users (id, email, password_hash, name, role, created_at) 
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `, [userId, email, hashedPassword, name, role || 'admin']);
            
            const newAdmin = await dbHelpers.get('SELECT * FROM users WHERE email = ?', [email]);
            res.json({ success: true, admin: newAdmin });
        }
    } catch (error) {
        console.error('Error adding admin:', error);
        res.status(500).json({ error: 'Failed to add admin' });
    }
});

// Delete admin user (admin)
app.delete('/admin/admins/:email', requireAuth, async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'super_admin';
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }
        
        const email = decodeURIComponent(req.params.email);
        
        // Don't allow deleting self
        if (email === req.user.email) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }
        
        await dbHelpers.run('UPDATE users SET role = ? WHERE email = ?', ['user', email]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting admin:', error);
        res.status(500).json({ error: 'Failed to delete admin' });
    }
});

// Get contacts (admin)
app.get('/admin/contacts', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const contacts = await dbHelpers.query('SELECT * FROM contact_submissions ORDER BY created_at DESC');
        res.json(contacts);
    } catch (error) {
        console.error('Error loading contacts:', error);
        res.status(500).json({ error: 'Failed to load contacts' });
    }
});

// Mark contact as read (admin)
app.put('/admin/contacts/:id/read', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        await dbHelpers.run('UPDATE contact_submissions SET is_read = 1 WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking contact as read:', error);
        res.status(500).json({ error: 'Failed to mark contact as read' });
    }
});

// Update contact status (admin)
app.put('/admin/contacts/:id/status', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { status } = req.body;
        await dbHelpers.run('UPDATE contact_submissions SET status = ? WHERE id = ?', [status, req.params.id]);
        
        const contact = await dbHelpers.get('SELECT * FROM contact_submissions WHERE id = ?', [req.params.id]);
        res.json({ success: true, contact });
    } catch (error) {
        console.error('Error updating contact status:', error);
        res.status(500).json({ error: 'Failed to update contact status' });
    }
});

// Delete contact (admin)
app.delete('/admin/contacts/:id', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        await dbHelpers.run('DELETE FROM contact_submissions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting contact:', error);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

// Get multiplier (admin)
app.get('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const setting = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['multiplier']);
        const multiplier = setting ? parseFloat(setting.value) : 1.3;
        res.json({ multiplier });
    } catch (error) {
        console.error('Error loading multiplier:', error);
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

// Update multiplier (admin)
app.put('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        
        const { multiplier } = req.body;
        await dbHelpers.run(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
        `, ['multiplier', multiplier.toString()]);
        
        res.json({ success: true, multiplier });
    } catch (error) {
        console.error('Error updating multiplier:', error);
        res.status(500).json({ error: 'Failed to update multiplier' });
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

// Emergency admin creation endpoint
app.post('/api/create-admin', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name required' });
        }
        
        // Check if user already exists
        const existingUser = await dbHelpers.get('SELECT id FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create admin user
        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(password, 12);
        
        await dbHelpers.run(`
            INSERT INTO users (id, email, password_hash, name, role, created_at) 
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [userId, email, hashedPassword, name, 'super_admin']);
        
        res.json({
            success: true,
            message: 'Admin user created successfully',
            user: {
                id: userId,
                email: email,
                name: name,
                role: 'super_admin'
            }
        });
        
    } catch (error) {
        console.error('Error creating admin:', error);
        res.status(500).json({ error: 'Failed to create admin user' });
    }
});

// Catch-all route for undefined routes
app.use('*', (req, res) => {
    console.log(`❌ Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
        error: 'Route not found',
        method: req.method,
        url: req.originalUrl,
        availableRoutes: [
            'GET /health',
            'POST /login',
            'POST /signup',
            'GET /me',
            'POST /logout',
            'GET /languages',
            'POST /analyze',
            'GET /multiplier',
            'GET /debug/settings',
            'POST /contact',
            'GET /projects',
            'POST /projects',
            'DELETE /projects/:id',
            'PUT /projects/:id/submit',
            'GET /admin/check',
            'GET /admin/projects',
            'PUT /admin/projects/:id/status',
            'PUT /admin/projects/:id/eta',
            'GET /admin/projects/:id',
            'GET /admin/projects/:id/download',
            'POST /admin/projects/:id/upload-translated',
            'GET /admin/languages',
            'GET /admin/languages/defaults',
            'PUT /admin/languages',
            'POST /admin/languages/add',
            'DELETE /admin/languages/:name',
            'POST /admin/languages/reset',
            'GET /admin/users',
            'PUT /admin/users/:id',
            'GET /admin/admins',
            'POST /admin/admins',
            'DELETE /admin/admins/:email',
            'GET /admin/contacts',
            'PUT /admin/contacts/:id/read',
            'PUT /admin/contacts/:id/status',
            'DELETE /admin/contacts/:id',
            'GET /admin/multiplier',
            'PUT /admin/multiplier',
            'POST /api/test-password',
            'POST /api/create-admin'
        ]
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('❌ Global error handler:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
});

// Start server
async function startServer() {
    try {
        console.log('🚀 Starting VerbiForge server...');
        console.log(`📁 Database path: ${dbPath}`);
        
        await initializeDatabase();
        
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/health`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
