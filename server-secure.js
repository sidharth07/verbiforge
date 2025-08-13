require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises'); // Added for file decryption

// Import our secure modules
const { dbHelpers, initializeTables } = require('./database');
const fileManager = require('./fileManager');
const authManager = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests from this IP, please try again later.' });
    }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 attempts per window (increased from 5)
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).json({ error: 'Too many authentication attempts, please try again later.' });
    }
});

app.use('/login', authLimiter);
app.use('/signup', authLimiter);
app.use(limiter);

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
    credentials: true
}));

app.use(express.static('public'));
app.use(express.json({ limit: '1mb' }));

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root endpoint to serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication middleware
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = authManager.verifyToken(token);
    
    if (!decoded) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
}

// Simple logout endpoint for clients to call
app.post('/logout', (req, res) => {
    return res.json({ success: true });
});

// Configure multer for secure file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (fileManager.isValidFileType(file)) {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files (.xlsx, .xls) are allowed'), false);
        }
    }
});

// Utility functions
function countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function extractTextFromExcel(buffer) {
    const workbook = XLSX.read(buffer);
    let allText = '';
    
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        data.forEach(row => {
            row.forEach(cell => {
                if (cell && typeof cell === 'string') {
                    allText += cell + ' ';
                }
            });
        });
    });
    
    return allText;
}

// Validation middleware
const validateSignup = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name').trim().isLength({ min: 1 }).withMessage('Name is required')
];

const validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
];

const validateContact = [
    body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
    body('email').isEmail().normalizeEmail(),
    body('subject').trim().isLength({ min: 1 }).withMessage('Subject is required'),
    body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters')
];

// Auth routes
app.post('/signup', validateSignup, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { email, password, name } = req.body;
        
        // Check if this is an admin signup
        const adminUser = await dbHelpers.get(
            'SELECT * FROM admin_users WHERE email = ?',
            [email]
        );
        
        let isAdminSignup = false;
        if (adminUser && adminUser.temp_password === password) {
            isAdminSignup = true;
        }

        const user = await authManager.createUser(email, password, name);
        const token = authManager.generateToken(user);

        res.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name },
            token,
            isAdmin: isAdminSignup
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/login', validateLogin, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { email, password } = req.body;
        const user = await authManager.authenticateUser(email, password);
        const token = authManager.generateToken(user);
        const isAdmin = await authManager.isAdmin(email);

        res.json({
            success: true,
            user: { id: user.id, email: user.email, name: user.name },
            token,
            isAdmin
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(400).json({ error: error.message });
    }
});

// Protected routes middleware
app.use('/me', authManager.authenticateToken.bind(authManager));
app.use('/projects', authManager.authenticateToken.bind(authManager));
app.use('/analyze', authManager.authenticateToken.bind(authManager));
app.use('/languages', authManager.authenticateToken.bind(authManager));
app.use('/admin/*', authManager.authenticateToken.bind(authManager));

// User info route
app.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await authManager.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Get languages
app.get('/languages', requireAuth, async (req, res) => {
    try {
        const settings = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = JSON.parse(settings.value);
        res.json(languages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

// Analyze file
app.post('/analyze', requireAuth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        if (!fileManager.isValidFileSize(req.file)) {
            return res.status(400).json({ error: 'File size too large (max 10MB)' });
        }

        const languages = JSON.parse(req.body.languages || '[]');
        const projectType = req.body.projectType || 'fusion';
        
        if (languages.length === 0) {
            return res.status(400).json({ error: 'Select at least one language' });
        }

        // Get current language pricing and multiplier
        const [languageSettings, multiplierSettings] = await Promise.all([
            dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']),
            dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['project_type_multiplier'])
        ]);

        const LANGUAGES = JSON.parse(languageSettings.value);
        const PROJECT_TYPE_MULTIPLIER = parseFloat(multiplierSettings.value);

        const text = extractTextFromExcel(req.file.buffer);
        const wordCount = countWords(text);
        
        // Apply multiplier for Pure projects
        const multiplier = projectType === 'pure' ? PROJECT_TYPE_MULTIPLIER : 1;
        
        const breakdown = languages.map(lang => ({
            language: lang,
            rate: LANGUAGES[lang],
            baseCost: (wordCount * LANGUAGES[lang] / 100).toFixed(2),
            cost: (wordCount * LANGUAGES[lang] * multiplier / 100).toFixed(2)
        }));

        const subtotal = breakdown.reduce((sum, item) => sum + parseFloat(item.cost), 0);
        const projectManagementCost = 500.00;
        const total = subtotal + projectManagementCost;

        // Store file securely
        console.log('Attempting to save file:', req.file.originalname, 'Size:', req.file.size);
        const fileInfo = await fileManager.saveUploadedFile(req.file, uuidv4());
        console.log('File saved successfully:', fileInfo.filePath);

        res.json({
            fileName: req.file.originalname,
            wordCount,
            projectType,
            multiplier: projectType === 'pure' ? PROJECT_TYPE_MULTIPLIER : 1,
            breakdown,
            subtotal: subtotal.toFixed(2),
            projectManagementCost: projectManagementCost.toFixed(2),
            total: total.toFixed(2),
            tempFileId: fileInfo.filePath
        });

    } catch (error) {
        console.error('Analysis error:', error);
        console.error('Error stack:', error.stack);
        
        if (error.message.includes('Failed to save file securely') || error.message.includes('File encryption failed')) {
            console.error('File processing failed - details:', {
                fileName: req.file?.originalname,
                fileSize: req.file?.size,
                error: error.message
            });
            res.status(500).json({ error: 'File processing failed. Please try again or contact support.' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// Save project
app.post('/projects', requireAuth, async (req, res) => {
    try {
        console.log('📥 Received project save request:', req.body);
        console.log('👤 User ID:', req.user.id);
        
        const { 
            projectName, fileName, wordCount, projectType, multiplier, 
            breakdown, subtotal, projectManagementCost, total, tempFileId 
        } = req.body;
        
        console.log('📋 Project data:', {
            projectName, fileName, wordCount, projectType, multiplier,
            breakdown: breakdown ? breakdown.length : 0, subtotal, projectManagementCost, total, tempFileId
        });
        
        const projectId = uuidv4();
        const user = await authManager.getUserById(req.user.id);
        
        console.log('👤 User data:', user);
        
        const insertResult = await dbHelpers.run(`
            INSERT INTO projects (
                id, user_id, user_name, user_email, name, file_name, file_path,
                project_type, multiplier, word_count, breakdown, subtotal,
                project_management_cost, total, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            projectId, user.id, user.name, user.email, projectName, fileName, tempFileId,
            projectType || 'fusion', multiplier || 1, wordCount, JSON.stringify(breakdown),
            subtotal || '0.00', projectManagementCost || '500.00', total, 'quote_generated'
        ]);
        
        console.log('✅ Project saved successfully:', { projectId, insertResult });
        res.json({ success: true, project: { id: projectId } });
    } catch (error) {
        console.error('❌ Project save error:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to save project: ' + error.message });
    }
});

// Get user projects
app.get('/projects', requireAuth, async (req, res) => {
    try {
        const projects = await dbHelpers.query(
            'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        
        const formattedProjects = projects.map(project => ({
            id: project.id,
            name: project.name,
            fileName: project.file_name,
            wordCount: project.word_count,
            projectType: project.project_type || 'fusion',
            multiplier: project.multiplier || 1,
            breakdown: JSON.parse(project.breakdown || '[]'),
            subtotal: project.subtotal,
            projectManagementCost: project.project_management_cost,
            total: project.total,
            status: project.status,
            createdAt: project.created_at,
            submittedAt: project.submitted_at,
            eta: project.eta,
            translatedFileName: project.translated_file_name
        }));
        
        res.json(formattedProjects);
    } catch (error) {
        console.error('Projects fetch error:', error);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Submit project (change status from quote_generated to submitted)
app.put('/projects/:id/submit', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get(
            'SELECT * FROM projects WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        if (project.status !== 'quote_generated') {
            return res.status(400).json({ error: 'Project already submitted' });
        }
        
        await dbHelpers.run(
            'UPDATE projects SET status = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['submitted', req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Project submit error:', error);
        res.status(500).json({ error: 'Failed to submit project' });
    }
});

// Delete project (only if status is quote_generated)
app.delete('/projects/:id', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get(
            'SELECT * FROM projects WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        
        if (project.status !== 'quote_generated') {
            return res.status(400).json({ error: 'Cannot delete submitted project' });
        }
        
        await dbHelpers.run('DELETE FROM projects WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Project delete error:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Download translated file
app.get('/projects/:id/download-translated', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get(
            'SELECT translated_file_path, translated_file_name FROM projects WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        
        if (!project || !project.translated_file_path) {
            return res.status(404).json({ error: 'Translated file not found' });
        }
        
        const filePath = path.join(__dirname, 'secure-files', 'translated', project.translated_file_path);
        const decryptedBuffer = fileManager.decryptFile(await fs.readFile(filePath));
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${project.translated_file_name}"`);
        res.send(decryptedBuffer);
    } catch (error) {
        console.error('Download translated error:', error);
        res.status(500).json({ error: 'Failed to download translated file' });
    }
});

// Contact form
app.post('/contact', validateContact, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array()[0].msg });
        }

        const { name, email, phone, company, subject, message } = req.body;
        const submissionId = uuidv4();
        
        await dbHelpers.run(`
            INSERT INTO contact_submissions (id, name, email, phone, company, subject, message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [submissionId, name, email, phone || '', company || '', subject, message]);
        
        res.json({ success: true, message: 'Thank you for your message. We will get back to you soon!' });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Failed to submit contact form' });
    }
});

// Admin check
app.get('/admin/check', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Admin check request from user:', req.user.email);
        
        const isAdmin = await authManager.isAdmin(req.user.email);
        const isSuperAdmin = await authManager.isSuperAdmin(req.user.email);
        
        console.log('🔍 Admin check results:', { email: req.user.email, isAdmin, isSuperAdmin });
        
        res.json({ isAdmin, isSuperAdmin });
    } catch (error) {
        console.error('❌ Admin check error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
});

// Admin routes
app.get('/admin/projects', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Admin projects request from user:', req.user.email);
        
        // Check if user is admin
        const isAdmin = await authManager.isAdmin(req.user.email);
        console.log('🔍 Is admin check result:', isAdmin);
        
        if (!isAdmin) {
            console.log('❌ User is not admin:', req.user.email);
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        
        console.log('✅ User is admin, fetching projects...');
        
        const projects = await dbHelpers.query(`
            SELECT p.*, u.name as userName, u.email as userEmail 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            ORDER BY p.created_at DESC
        `);
        
        console.log('📋 Raw projects from database:', projects.length);
        
        const formattedProjects = projects.map(project => ({
            id: project.id,
            name: project.name,
            fileName: project.file_name,
            wordCount: project.word_count,
            projectType: project.project_type || 'fusion',
            multiplier: project.multiplier || 1,
            breakdown: JSON.parse(project.breakdown || '[]'),
            subtotal: project.subtotal,
            projectManagementCost: project.project_management_cost,
            total: project.total,
            status: project.status,
            createdAt: project.created_at,
            submittedAt: project.submitted_at,
            eta: project.eta,
            translatedFileName: project.translated_file_name,
            userName: project.userName,
            userEmail: project.userEmail
        }));
        
        console.log('✅ Sending formatted projects:', formattedProjects.length);
        res.json(formattedProjects);
    } catch (error) {
        console.error('❌ Admin projects fetch error:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to load projects: ' + error.message });
    }
});

app.get('/admin/projects/:id', requireAuth, async (req, res) => {
    try {
        console.log('🔍 Admin project details request for ID:', req.params.id);
        
        const project = await dbHelpers.get(`
            SELECT p.*, u.name as userName, u.email as userEmail 
            FROM projects p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.id = ?
        `, [req.params.id]);
        
        if (!project) {
            console.log('❌ Project not found:', req.params.id);
            return res.status(404).json({ error: 'Project not found' });
        }
        
        console.log('📋 Raw project data:', project);
        
        // Format the project data consistently with the projects list
        const formattedProject = {
            id: project.id,
            name: project.name,
            fileName: project.file_name,
            wordCount: project.word_count,
            projectType: project.project_type || 'fusion',
            multiplier: project.multiplier || 1,
            breakdown: JSON.parse(project.breakdown || '[]'),
            subtotal: project.subtotal,
            projectManagementCost: project.project_management_cost,
            total: project.total,
            status: project.status,
            createdAt: project.created_at,
            submittedAt: project.submitted_at,
            eta: project.eta,
            translatedFileName: project.translated_file_name,
            userName: project.userName,
            userEmail: project.userEmail
        };
        
        console.log('✅ Sending formatted project:', formattedProject);
        res.json(formattedProject);
    } catch (error) {
        console.error('❌ Admin project fetch error:', error);
        console.error('❌ Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to load project: ' + error.message });
    }
});

app.put('/admin/projects/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await dbHelpers.run(
            'UPDATE projects SET status = ? WHERE id = ?',
            [status, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Admin status update error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.put('/admin/projects/:id/eta', requireAuth, async (req, res) => {
    try {
        const { eta } = req.body;
        await dbHelpers.run(
            'UPDATE projects SET eta = ? WHERE id = ?',
            [eta, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Admin ETA update error:', error);
        res.status(500).json({ error: 'Failed to update ETA' });
    }
});

app.get('/admin/projects/:id/download', requireAuth, async (req, res) => {
    try {
        const project = await dbHelpers.get(
            'SELECT file_path FROM projects WHERE id = ?',
            [req.params.id]
        );
        
        if (!project || !project.file_path) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const filePath = path.join(__dirname, 'secure-files', 'uploads', project.file_path);
        const decryptedBuffer = fileManager.decryptFile(await fs.readFile(filePath));
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="project_${req.params.id}.xlsx"`);
        res.send(decryptedBuffer);
    } catch (error) {
        console.error('Admin download error:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

app.post('/admin/projects/:id/upload-translated', requireAuth, upload.single('translatedFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        const fileInfo = await fileManager.saveTranslatedFile(req.file, req.params.id);
        
        await dbHelpers.run(
            'UPDATE projects SET translated_file_path = ?, translated_file_name = ? WHERE id = ?',
            [fileInfo.filePath, fileInfo.originalName, req.params.id]
        );
        
        res.json({ success: true, fileName: fileInfo.originalName });
    } catch (error) {
        console.error('Admin upload translated error:', error);
        res.status(500).json({ error: 'Failed to upload translated file' });
    }
});

// Language management
app.get('/admin/languages', requireAuth, async (req, res) => {
    try {
        const settings = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = JSON.parse(settings.value);
        res.json(languages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load languages' });
    }
});

app.get('/admin/languages/defaults', requireAuth, async (req, res) => {
    try {
        const defaultLanguages = {
            'English': 25,
            'Arabic': 50,
            'Chinese (Simplified)': 35,
            'Dutch': 40,
            'French': 35,
            'German': 45,
            'Portuguese (Brazil)': 35,
            'Portuguese (Portugal)': 35,
            'Spanish (Latin America)': 35,
            'Spanish (Spain)': 35,
            'Afrikaans': 30,
            'Albanian': 40,
            'Amharic': 45,
            'Arabic (Morocco)': 50,
            'Armenian': 45,
            'Assamese': 40,
            'Azerbaijani': 40,
            'Bahasa Indonesia': 35,
            'Baltic': 40,
            'Bangla': 40,
            'Bosnian': 40,
            'Bulgarian': 40,
            'Burmese': 45,
            'Catalan': 35,
            'Chamorro': 50,
            'Chinese (Hong Kong)': 35,
            'Chinese (Traditional)': 35,
            'Croatian': 40,
            'Cyrillic': 40,
            'Czech': 40,
            'Danish': 40,
            'Dari': 50,
            'English (Canada)': 25,
            'English (Nigeria)': 25,
            'English (UK)': 25,
            'Estonian': 40,
            'Faroese': 50,
            'Finnish': 45,
            'Flemish': 40,
            'French (Canada)': 35,
            'Georgian': 45,
            'Greek': 40,
            'Gujarati': 40,
            'Gurmukhi': 40,
            'Haitian Creole': 45,
            'Hausa': 45,
            'Hebrew': 30,
            'Hindi': 35,
            'Hmong': 50,
            'Hungarian': 40,
            'Icelandic': 50,
            'Indonesian': 35,
            'IsiXhosa (Xhosa)': 40,
            'Italian': 35,
            'Japanese': 35,
            'Kanjobal': 50,
            'Kannada': 40,
            'Karen': 50,
            'Kazakh (Kazakhstan)': 40,
            'Khmer': 45,
            'Kinyarwanda': 45,
            'Klingon': 60,
            'Korean': 35,
            'Kurdish (Kurmanji)': 50,
            'Laotian': 45,
            'Latvian': 40,
            'Lithuanian': 40,
            'Macedonian': 40,
            'Malay': 35,
            'Malayalam': 40,
            'Maltese': 50,
            'Mandinka': 50,
            'Maori': 50,
            'Marathi': 40,
            'Moldovan': 40,
            'Mongolian': 45,
            'Montenegrin': 40,
            'Nepali': 40,
            'Norwegian': 40,
            'Odia': 40,
            'Oromo': 45,
            'Pashto': 50,
            'Persian': 45,
            'Polish': 40,
            'Punjabi': 40,
            'Roman Urdu': 40,
            'Romanian': 40,
            'Russian': 35,
            'Sepedi': 40,
            'Serbian': 40,
            'Sesotho': 40,
            'Sinhala': 40,
            'Sinhalese': 40,
            'Slovakian': 40,
            'Slovenian': 40,
            'Somali': 45,
            'Spanish (Argentina)': 35,
            'Spanish (Bolivia)': 35,
            'Spanish (Chile)': 35,
            'Spanish (Colombia)': 35,
            'Spanish (Ecuador)': 35,
            'Spanish (Mexico)': 35,
            'Spanish (Paraguay)': 35,
            'Spanish (Peru)': 35,
            'Spanish (Uruguay)': 35,
            'Spanish (Venezuela)': 35,
            'Swahili': 40,
            'Swazi': 40,
            'Swedish': 40,
            'Tagalog': 35,
            'Tagalog (Philippines)': 35,
            'Tamil': 40,
            'Telugu': 40,
            'Thai': 35,
            'Tigrinya': 45,
            'Turkish': 40,
            'Ukrainian': 40,
            'Urdu': 40,
            'Urdu (Pakistan)': 40,
            'Uzbek': 40,
            'Vietnamese': 35,
            'Welsh': 45,
            'Xitsonga': 40,
            'Yoruba': 45,
            'Zulu': 40
        };
        res.json(defaultLanguages);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load default languages' });
    }
});

app.put('/admin/languages', requireAuth, async (req, res) => {
    try {
        const { languages } = req.body;
        await dbHelpers.run(
            'UPDATE settings SET value = ? WHERE key = ?',
            [JSON.stringify(languages), 'languages']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update languages' });
    }
});

app.post('/admin/languages/add', requireAuth, async (req, res) => {
    try {
        const { languageName, price } = req.body;
        const settings = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = JSON.parse(settings.value);
        languages[languageName] = price;
        
        await dbHelpers.run(
            'UPDATE settings SET value = ? WHERE key = ?',
            [JSON.stringify(languages), 'languages']
        );
        
        res.json({ success: true, languages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to add language' });
    }
});

app.delete('/admin/languages/:languageName', requireAuth, async (req, res) => {
    try {
        const languageName = decodeURIComponent(req.params.languageName);
        const settings = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['languages']);
        const languages = JSON.parse(settings.value);
        delete languages[languageName];
        
        await dbHelpers.run(
            'UPDATE settings SET value = ? WHERE key = ?',
            [JSON.stringify(languages), 'languages']
        );
        
        res.json({ success: true, languages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete language' });
    }
});

app.post('/admin/languages/reset', requireAuth, async (req, res) => {
    try {
        const defaultLanguages = {
            'English': 25,
            'Arabic': 50,
            'Chinese (Simplified)': 35,
            'Dutch': 40,
            'French': 35,
            'German': 45,
            'Portuguese (Brazil)': 35,
            'Portuguese (Portugal)': 35,
            'Spanish (Latin America)': 35,
            'Spanish (Spain)': 35,
            'Afrikaans': 30,
            'Albanian': 40,
            'Amharic': 45,
            'Arabic (Morocco)': 50,
            'Armenian': 45,
            'Assamese': 40,
            'Azerbaijani': 40,
            'Bahasa Indonesia': 35,
            'Baltic': 40,
            'Bangla': 40,
            'Bosnian': 40,
            'Bulgarian': 40,
            'Burmese': 45,
            'Catalan': 35,
            'Chamorro': 50,
            'Chinese (Hong Kong)': 35,
            'Chinese (Traditional)': 35,
            'Croatian': 40,
            'Cyrillic': 40,
            'Czech': 40,
            'Danish': 40,
            'Dari': 50,
            'English (Canada)': 25,
            'English (Nigeria)': 25,
            'English (UK)': 25,
            'Estonian': 40,
            'Faroese': 50,
            'Finnish': 45,
            'Flemish': 40,
            'French (Canada)': 35,
            'Georgian': 45,
            'Greek': 40,
            'Gujarati': 40,
            'Gurmukhi': 40,
            'Haitian Creole': 45,
            'Hausa': 45,
            'Hebrew': 30,
            'Hindi': 35,
            'Hmong': 50,
            'Hungarian': 40,
            'Icelandic': 50,
            'Indonesian': 35,
            'IsiXhosa (Xhosa)': 40,
            'Italian': 35,
            'Japanese': 35,
            'Kanjobal': 50,
            'Kannada': 40,
            'Karen': 50,
            'Kazakh (Kazakhstan)': 40,
            'Khmer': 45,
            'Kinyarwanda': 45,
            'Klingon': 60,
            'Korean': 35,
            'Kurdish (Kurmanji)': 50,
            'Laotian': 45,
            'Latvian': 40,
            'Lithuanian': 40,
            'Macedonian': 40,
            'Malay': 35,
            'Malayalam': 40,
            'Maltese': 50,
            'Mandinka': 50,
            'Maori': 50,
            'Marathi': 40,
            'Moldovan': 40,
            'Mongolian': 45,
            'Montenegrin': 40,
            'Nepali': 40,
            'Norwegian': 40,
            'Odia': 40,
            'Oromo': 45,
            'Pashto': 50,
            'Persian': 45,
            'Polish': 40,
            'Punjabi': 40,
            'Roman Urdu': 40,
            'Romanian': 40,
            'Russian': 35,
            'Sepedi': 40,
            'Serbian': 40,
            'Sesotho': 40,
            'Sinhala': 40,
            'Sinhalese': 40,
            'Slovakian': 40,
            'Slovenian': 40,
            'Somali': 45,
            'Spanish (Argentina)': 35,
            'Spanish (Bolivia)': 35,
            'Spanish (Chile)': 35,
            'Spanish (Colombia)': 35,
            'Spanish (Ecuador)': 35,
            'Spanish (Mexico)': 35,
            'Spanish (Paraguay)': 35,
            'Spanish (Peru)': 35,
            'Spanish (Uruguay)': 35,
            'Spanish (Venezuela)': 35,
            'Swahili': 40,
            'Swazi': 40,
            'Swedish': 40,
            'Tagalog': 35,
            'Tagalog (Philippines)': 35,
            'Tamil': 40,
            'Telugu': 40,
            'Thai': 35,
            'Tigrinya': 45,
            'Turkish': 40,
            'Ukrainian': 40,
            'Urdu': 40,
            'Urdu (Pakistan)': 40,
            'Uzbek': 40,
            'Vietnamese': 35,
            'Welsh': 45,
            'Xitsonga': 40,
            'Yoruba': 45,
            'Zulu': 40
        };
        
        await dbHelpers.run(
            'UPDATE settings SET value = ? WHERE key = ?',
            [JSON.stringify(defaultLanguages), 'languages']
        );
        
        res.json({ success: true, languages: defaultLanguages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reset languages' });
    }
});

// User management
app.get('/admin/users', requireAuth, async (req, res) => {
    try {
        const users = await dbHelpers.query(`
            SELECT u.*, 
                   COUNT(p.id) as projectCount,
                   COALESCE(SUM(p.total), 0) as totalSpent
            FROM users u
            LEFT JOIN projects p ON u.id = p.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load users' });
    }
});

app.delete('/admin/users/:userId', requireAuth, async (req, res) => {
    try {
        await dbHelpers.run('DELETE FROM projects WHERE user_id = ?', [req.params.userId]);
        await dbHelpers.run('DELETE FROM users WHERE id = ?', [req.params.userId]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Admin management
app.get('/admin/admins', requireAuth, async (req, res) => {
    try {
        const admins = await dbHelpers.query('SELECT * FROM admin_users ORDER BY created_at DESC');
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load admins' });
    }
});

app.post('/admin/admins', requireAuth, async (req, res) => {
    try {
        const { email, name, tempPassword } = req.body;
        await dbHelpers.run(
            'INSERT INTO admin_users (email, name, temp_password, created_by) VALUES (?, ?, ?, ?)',
            [email, name, tempPassword, req.user.email]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

app.delete('/admin/admins/:email', requireAuth, async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);
        await dbHelpers.run('DELETE FROM admin_users WHERE email = ? AND is_super_admin = FALSE', [email]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete admin' });
    }
});

// Contact management
app.get('/admin/contacts', requireAuth, async (req, res) => {
    try {
        const submissions = await dbHelpers.query('SELECT * FROM contact_submissions ORDER BY submitted_at DESC');
        const unreadCount = await dbHelpers.get('SELECT COUNT(*) as count FROM contact_submissions WHERE is_read = FALSE');
        res.json({ submissions, unreadCount: unreadCount.count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load contacts' });
    }
});

app.put('/admin/contacts/:id/read', requireAuth, async (req, res) => {
    try {
        await dbHelpers.run('UPDATE contact_submissions SET is_read = TRUE WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark as read' });
    }
});

app.put('/admin/contacts/:id/status', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        await dbHelpers.run('UPDATE contact_submissions SET status = ? WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.delete('/admin/contacts/:id', requireAuth, async (req, res) => {
    try {
        await dbHelpers.run('DELETE FROM contact_submissions WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

// Multiplier management
app.get('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const settings = await dbHelpers.get('SELECT value FROM settings WHERE key = ?', ['project_type_multiplier']);
        res.json({ multiplier: parseFloat(settings.value) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load multiplier' });
    }
});

app.put('/admin/multiplier', requireAuth, async (req, res) => {
    try {
        const { multiplier } = req.body;
        await dbHelpers.run(
            'UPDATE settings SET value = ? WHERE key = ?',
            [multiplier.toString(), 'project_type_multiplier']
        );
        res.json({ success: true, multiplier });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update multiplier' });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large (max 10MB)' });
        }
    }
    
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database tables
        await initializeTables();
        console.log('Database tables initialized');
        
        // Start the server
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Secure VerbiForge server running on port ${PORT}`);
            console.log(`🌐 Server accessible at: http://localhost:${PORT}`);
            console.log('🔒 Security features enabled:');
            console.log('  - SQLite database with encrypted storage');
            console.log('  - Bcrypt password hashing');
            console.log('  - JWT authentication');
            console.log('  - File encryption');
            console.log('  - Rate limiting');
            console.log('  - Input validation');
            console.log('  - Security headers');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();