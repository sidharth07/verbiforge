const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3006;

// Default language pricing (cents per word) - can be updated by admin
const DEFAULT_LANGUAGES = {
  'English': 30,
  'Arabic': 50,
  'Chinese (Simplified)': 45,
  'Dutch': 35,
  'French': 35,
  'German': 45,
  'Portuguese (Brazil)': 35,
  'Portuguese (Portugal)': 35,
  'Spanish (Latin America)': 35,
  'Spanish (Spain)': 35,
  'Afrikaans': 40,
  'Albanian': 40,
  'Amharic': 50,
  'Arabic (Morocco)': 50,
  'Armenian': 45,
  'Assamese': 45,
  'Azerbaijani': 45,
  'Bahasa Indonesia': 40,
  'Baltic': 45,
  'Bangla': 40,
  'Bosnian': 40,
  'Bulgarian': 40,
  'Burmese': 50,
  'Catalan': 35,
  'Chamorro': 55,
  'Chinese (Hong Kong)': 45,
  'Chinese (Traditional)': 45,
  'Croatian': 40,
  'Cyrillic': 45,
  'Czech': 40,
  'Danish': 40,
  'Dari': 50,
  'English (Canada)': 30,
  'English (Nigeria)': 35,
  'English (UK)': 30,
  'Estonian': 45,
  'Faroese': 50,
  'Finnish': 45,
  'Flemish': 35,
  'French (Canada)': 35,
  'Georgian': 50,
  'Greek': 40,
  'Gujarati': 45,
  'Gurmukhi': 45,
  'Haitian Creole': 45,
  'Hausa': 50,
  'Hebrew': 45,
  'Hindi': 40,
  'Hmong': 55,
  'Hungarian': 45,
  'Icelandic': 50,
  'Indonesian': 40,
  'IsiXhosa (Xhosa)': 50,
  'Italian': 35,
  'Japanese': 50,
  'Kanjobal': 60,
  'Kannada': 45,
  'Karen': 55,
  'Kazakh (Kazakhstan)': 50,
  'Khmer': 50,
  'Kinyarwanda': 50,
  'Klingon': 70,
  'Korean': 50,
  'Kurdish (Kurmanji)': 55,
  'Laotian': 50,
  'Latvian': 45,
  'Lithuanian': 45,
  'Macedonian': 45,
  'Malay': 40,
  'Malayalam': 45,
  'Maltese': 50,
  'Mandinka': 55,
  'Maori': 50,
  'Marathi': 45,
  'Moldovan': 45,
  'Mongolian': 50,
  'Montenegrin': 45,
  'Nepali': 45,
  'Norwegian': 40,
  'Odia': 45,
  'Oromo': 55,
  'Pashto': 55,
  'Persian': 50,
  'Polish': 40,
  'Punjabi': 45,
  'Roman Urdu': 45,
  'Romanian': 40,
  'Russian': 45,
  'Sepedi': 50,
  'Serbian': 40,
  'Sesotho': 50,
  'Sinhala': 50,
  'Sinhalese': 50,
  'Slovakian': 40,
  'Slovenian': 40,
  'Somali': 55,
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
  'Swahili': 50,
  'Swazi': 50,
  'Swedish': 40,
  'Tagalog': 40,
  'Tagalog (Philippines)': 40,
  'Tamil': 45,
  'Telugu': 45,
  'Thai': 50,
  'Tigrinya': 55,
  'Turkish': 45,
  'Ukrainian': 45,
  'Urdu': 45,
  'Urdu (Pakistan)': 45,
  'Uzbek': 50,
  'Vietnamese': 45,
  'Welsh': 45,
  'Xitsonga': 50,
  'Yoruba': 50,
  'Zulu': 50
};

// Dynamic language pricing (admin can modify)
let LANGUAGES = { ...DEFAULT_LANGUAGES };

// Project type multiplier (admin can modify)
let PROJECT_TYPE_MULTIPLIER = 1.3; // Default multiplier for Pure projects

// In-memory storage (use database in production)
const users = new Map();
const projects = new Map();
const projectFiles = new Map(); // Store uploaded files
const translatedFiles = new Map(); // Store translated files uploaded by admin
const adminUsers = new Map(); // Store admin users
const contactSubmissions = new Map(); // Store contact form submissions

// Default super admin (cannot be deleted)
const SUPER_ADMIN_EMAIL = 'admin@test.com';

// Initialize default admin users
adminUsers.set('admin@test.com', {
  email: 'admin@test.com',
  name: 'Super Admin',
  createdAt: new Date().toISOString(),
  createdBy: 'system',
  isSuperAdmin: true
});

adminUsers.set('admin@example.com', {
  email: 'admin@example.com',
  name: 'Admin User',
  createdAt: new Date().toISOString(),
  createdBy: 'system',
  isSuperAdmin: false
});

// Get current admin emails
function getAdminEmails() {
  return Array.from(adminUsers.keys());
}

app.use(cors());

// Disable caching in development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use(express.static('public'));
app.use(express.json());
app.use(session({
  secret: 'verbiforge-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

const upload = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files allowed'), false);
    }
  }
});

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

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

// Auth routes
app.post('/signup', (req, res) => {
  const { email, password, name } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  if (users.has(email)) {
    return res.status(400).json({ error: 'User already exists' });
  }
  
  const userId = Date.now().toString();
  const userData = { 
    id: userId, 
    email, 
    password, 
    name,
    createdAt: new Date().toISOString()
  };
  
  // Check if this is an admin user with temporary password
  const adminUser = adminUsers.get(email);
  const isAdminSignup = adminUser && adminUser.tempPassword === password;
  if (isAdminSignup) {
    userData.isAdminSignup = true;
  }
  
  users.set(email, userData);
  
  req.session.userId = userId;
  req.session.userEmail = email;
  
  res.json({ 
    success: true, 
    user: { id: userId, email, name },
    isAdmin: isAdminSignup
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  const user = users.get(email);
  if (!user || user.password !== password) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  
  req.session.userId = user.id;
  req.session.userEmail = email;
  
  // Check if user is admin
  const isAdmin = getAdminEmails().includes(email);
  
  res.json({ 
    success: true, 
    user: { id: user.id, email, name: user.name },
    isAdmin: isAdmin
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const user = Array.from(users.values()).find(u => u.id === req.session.userId);
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
});

// Project routes
app.get('/languages', requireAuth, (req, res) => {
  res.json(LANGUAGES);
});

app.post('/analyze', requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const languages = JSON.parse(req.body.languages || '[]');
    const projectType = req.body.projectType || 'fusion'; // Default to fusion
    
    if (languages.length === 0) {
      return res.status(400).json({ error: 'Select at least one language' });
    }

    if (!['fusion', 'pure'].includes(projectType)) {
      return res.status(400).json({ error: 'Invalid project type' });
    }

    const text = extractTextFromExcel(req.file.buffer);
    const wordCount = countWords(text);
    
    // Apply multiplier for Pure projects
    const multiplier = projectType === 'pure' ? PROJECT_TYPE_MULTIPLIER : 1;
    
    const breakdown = languages.map(lang => ({
      language: lang,
      rate: LANGUAGES[lang], // Keep in cents for display
      baseCost: (wordCount * LANGUAGES[lang] / 100).toFixed(2),
      cost: (wordCount * LANGUAGES[lang] * multiplier / 100).toFixed(2) // Apply multiplier
    }));

    const subtotal = breakdown.reduce((sum, item) => sum + parseFloat(item.cost), 0);
    const projectManagementCost = 500.00;
    const total = subtotal + projectManagementCost;

    // Store file temporarily for potential project creation
    const tempFileId = Date.now().toString();
    req.session.tempFile = {
      id: tempFileId,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype
    };

    res.json({
      fileName: req.file.originalname,
      wordCount,
      projectType,
      multiplier: projectType === 'pure' ? PROJECT_TYPE_MULTIPLIER : 1,
      breakdown,
      subtotal: subtotal.toFixed(2),
      projectManagementCost: projectManagementCost.toFixed(2),
      total: total.toFixed(2),
      tempFileId: tempFileId
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/projects', requireAuth, (req, res) => {
  const { projectName, fileName, wordCount, projectType, multiplier, breakdown, subtotal, projectManagementCost, total, tempFileId } = req.body;
  
  console.log('Received project data:', { projectName, fileName, wordCount, projectType, multiplier }); // Debug log
  
  const projectId = Date.now().toString();
  const user = Array.from(users.values()).find(u => u.id === req.session.userId);
  
  const project = {
    id: projectId,
    userId: req.session.userId,
    userName: user ? user.name : 'Unknown',
    userEmail: user ? user.email : 'Unknown',
    name: projectName,
    fileName,
    wordCount,
    projectType: projectType || 'fusion',
    multiplier: multiplier || 1,
    breakdown,
    subtotal: subtotal || '0.00',
    projectManagementCost: projectManagementCost || '500.00',
    total,
    status: 'quote_generated',
    eta: null,
    submittedAt: null,
    createdAt: new Date().toISOString()
  };
  
  // Store the uploaded file
  if (req.session.tempFile) {
    projectFiles.set(projectId, {
      buffer: req.session.tempFile.buffer,
      originalname: req.session.tempFile.originalname,
      mimetype: req.session.tempFile.mimetype
    });
    delete req.session.tempFile;
  }
  
  projects.set(projectId, project);
  
  res.json({ success: true, project });
});

app.get('/projects', requireAuth, (req, res) => {
  const userProjects = Array.from(projects.values())
    .filter(p => p.userId === req.session.userId)
    .map(project => ({
      ...project,
      projectType: project.projectType || 'fusion', // Default to fusion for legacy projects
      multiplier: project.multiplier || 1 // Default multiplier
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(userProjects);
});

app.delete('/projects/:id', requireAuth, (req, res) => {
  const project = projects.get(req.params.id);
  
  if (!project || project.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  projects.delete(req.params.id);
  projectFiles.delete(req.params.id);
  res.json({ success: true });
});

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = Array.from(users.values()).find(u => u.id === req.session.userId);
  if (!user || !getAdminEmails().includes(user.email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

// Super admin middleware
function requireSuperAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = Array.from(users.values()).find(u => u.id === req.session.userId);
  if (!user || user.email !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  
  next();
}

// Admin routes
app.get('/admin/projects', requireAdmin, (req, res) => {
  const allProjects = Array.from(projects.values())
    .map(project => ({
      ...project,
      projectType: project.projectType || 'fusion', // Default to fusion for legacy projects
      multiplier: project.multiplier || 1 // Default multiplier
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(allProjects);
});

app.put('/admin/projects/:id/eta', requireAdmin, (req, res) => {
  const { eta } = req.body;
  const project = projects.get(req.params.id);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  project.eta = eta;
  project.status = eta ? 'in_progress' : 'pending';
  projects.set(req.params.id, project);
  
  res.json({ success: true, project });
});

app.get('/admin/projects/:id/download', requireAdmin, (req, res) => {
  const project = projects.get(req.params.id);
  const file = projectFiles.get(req.params.id);
  
  if (!project || !file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalname}"`);
  res.setHeader('Content-Type', file.mimetype);
  res.send(file.buffer);
});

app.get('/admin/check', requireAuth, (req, res) => {
  const user = Array.from(users.values()).find(u => u.id === req.session.userId);
  const isAdmin = user && getAdminEmails().includes(user.email);
  const isSuperAdmin = user && user.email === SUPER_ADMIN_EMAIL;
  res.json({ isAdmin, isSuperAdmin });
});

app.get('/admin/languages', requireAdmin, (req, res) => {
  res.json(LANGUAGES);
});

app.get('/admin/languages/defaults', requireAdmin, (req, res) => {
  res.json(DEFAULT_LANGUAGES);
});

app.put('/admin/languages', requireAdmin, (req, res) => {
  const { languages } = req.body;
  
  if (!languages || typeof languages !== 'object') {
    return res.status(400).json({ error: 'Invalid language data' });
  }
  
  // Update language pricing
  LANGUAGES = { ...languages };
  
  res.json({ success: true, languages: LANGUAGES });
});

app.post('/admin/languages/reset', requireAdmin, (req, res) => {
  LANGUAGES = { ...DEFAULT_LANGUAGES };
  res.json({ success: true, languages: LANGUAGES });
});

app.get('/admin/multiplier', requireAdmin, (req, res) => {
  res.json({ multiplier: PROJECT_TYPE_MULTIPLIER });
});

app.put('/admin/multiplier', requireAdmin, (req, res) => {
  const { multiplier } = req.body;
  
  if (!multiplier || typeof multiplier !== 'number' || multiplier < 1 || multiplier > 5) {
    return res.status(400).json({ error: 'Multiplier must be a number between 1 and 5' });
  }
  
  PROJECT_TYPE_MULTIPLIER = multiplier;
  
  res.json({ success: true, multiplier: PROJECT_TYPE_MULTIPLIER });
});

app.post('/admin/languages/add', requireAdmin, (req, res) => {
  const { languageName, price } = req.body;
  
  if (!languageName || !price) {
    return res.status(400).json({ error: 'Language name and price are required' });
  }
  
  if (typeof price !== 'number' || price < 1 || price > 999) {
    return res.status(400).json({ error: 'Price must be a number between 1 and 999' });
  }
  
  if (LANGUAGES[languageName]) {
    return res.status(400).json({ error: 'Language already exists' });
  }
  
  LANGUAGES[languageName] = price;
  
  res.json({ success: true, languages: LANGUAGES });
});

app.delete('/admin/languages/:name', requireAdmin, (req, res) => {
  const languageName = decodeURIComponent(req.params.name);
  
  if (!LANGUAGES[languageName]) {
    return res.status(404).json({ error: 'Language not found' });
  }
  
  // Check if language is in default list (prevent deletion of core languages)
  if (DEFAULT_LANGUAGES[languageName]) {
    return res.status(400).json({ error: 'Cannot delete default language. Use reset to restore defaults.' });
  }
  
  delete LANGUAGES[languageName];
  
  res.json({ success: true, languages: LANGUAGES });
});

app.get('/admin/projects/:id', requireAdmin, (req, res) => {
  const project = projects.get(req.params.id);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  res.json(project);
});

app.post('/admin/projects/:id/upload-translated', requireAdmin, upload.single('translatedFile'), (req, res) => {
  try {
    const project = projects.get(req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Store the translated file
    translatedFiles.set(req.params.id, {
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString()
    });
    
    // Update project status
    project.status = 'completed';
    project.translatedFileName = req.file.originalname;
    projects.set(req.params.id, project);
    
    res.json({ success: true, fileName: req.file.originalname });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/projects/:id/download-translated', requireAuth, (req, res) => {
  const project = projects.get(req.params.id);
  const translatedFile = translatedFiles.get(req.params.id);
  
  if (!project || project.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  if (!translatedFile) {
    return res.status(404).json({ error: 'Translated file not available yet' });
  }
  
  res.setHeader('Content-Disposition', `attachment; filename="${translatedFile.originalname}"`);
  res.setHeader('Content-Type', translatedFile.mimetype);
  res.send(translatedFile.buffer);
});

app.put('/projects/:id/submit', requireAuth, (req, res) => {
  const project = projects.get(req.params.id);
  
  if (!project || project.userId !== req.session.userId) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  if (project.status !== 'quote_generated') {
    return res.status(400).json({ error: 'Project cannot be submitted in current status' });
  }
  
  project.status = 'submitted';
  project.submittedAt = new Date().toISOString();
  projects.set(req.params.id, project);
  
  res.json({ success: true, project });
});

app.put('/admin/projects/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const project = projects.get(req.params.id);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  const validStatuses = ['submitted', 'in_progress', 'proofreading', 'ready', 'completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  project.status = status;
  projects.set(req.params.id, project);
  
  res.json({ success: true, project });
});

// Admin user management routes
app.get('/admin/admins', requireSuperAdmin, (req, res) => {
  const adminList = Array.from(adminUsers.values());
  res.json(adminList);
});

app.post('/admin/admins', requireSuperAdmin, (req, res) => {
  const { email, name, tempPassword } = req.body;
  
  if (!email || !name || !tempPassword) {
    return res.status(400).json({ error: 'Email, name, and temporary password are required' });
  }
  
  if (adminUsers.has(email)) {
    return res.status(400).json({ error: 'Admin user already exists' });
  }
  
  const currentUser = Array.from(users.values()).find(u => u.id === req.session.userId);
  
  // Create admin user entry
  adminUsers.set(email, {
    email,
    name,
    tempPassword,
    createdAt: new Date().toISOString(),
    createdBy: currentUser.email,
    isSuperAdmin: false
  });
  
  res.json({ success: true, message: 'Admin user created successfully' });
});

app.delete('/admin/admins/:email', requireSuperAdmin, (req, res) => {
  const email = decodeURIComponent(req.params.email);
  
  if (email === SUPER_ADMIN_EMAIL) {
    return res.status(400).json({ error: 'Cannot delete super admin' });
  }
  
  if (!adminUsers.has(email)) {
    return res.status(404).json({ error: 'Admin user not found' });
  }
  
  adminUsers.delete(email);
  res.json({ success: true, message: 'Admin user deleted successfully' });
});

// User management routes
app.get('/admin/users', requireAdmin, (req, res) => {
  const userList = Array.from(users.values()).map(user => ({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt || new Date().toISOString(),
    projectCount: Array.from(projects.values()).filter(p => p.userId === user.id).length,
    totalSpent: Array.from(projects.values())
      .filter(p => p.userId === user.id)
      .reduce((sum, p) => sum + parseFloat(p.total), 0)
  }));
  
  res.json(userList);
});

app.delete('/admin/users/:id', requireSuperAdmin, (req, res) => {
  const userId = req.params.id;
  const user = Array.from(users.values()).find(u => u.id === userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Delete user's projects and files
  const userProjects = Array.from(projects.entries()).filter(([id, project]) => project.userId === userId);
  userProjects.forEach(([projectId]) => {
    projects.delete(projectId);
    projectFiles.delete(projectId);
    translatedFiles.delete(projectId);
  });
  
  // Delete user
  users.delete(user.email);
  
  res.json({ success: true, message: 'User and associated data deleted successfully' });
});

// Contact form routes
app.post('/contact', (req, res) => {
  const { name, email, phone, company, subject, message } = req.body;
  
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject, and message are required' });
  }
  
  const submissionId = Date.now().toString();
  const submission = {
    id: submissionId,
    name,
    email,
    phone: phone || '',
    company: company || '',
    subject,
    message,
    status: 'new',
    isRead: false,
    submittedAt: new Date().toISOString()
  };
  
  contactSubmissions.set(submissionId, submission);
  
  res.json({ success: true, message: 'Thank you for your message. We will get back to you soon!' });
});

app.get('/admin/contacts', requireAdmin, (req, res) => {
  const submissions = Array.from(contactSubmissions.values())
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  
  const unreadCount = submissions.filter(s => !s.isRead).length;
  
  res.json({
    submissions,
    unreadCount
  });
});

app.put('/admin/contacts/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const submission = contactSubmissions.get(req.params.id);
  
  if (!submission) {
    return res.status(404).json({ error: 'Contact submission not found' });
  }
  
  const validStatuses = ['new', 'in_progress', 'resolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  submission.status = status;
  contactSubmissions.set(req.params.id, submission);
  
  res.json({ success: true, submission });
});

app.put('/admin/contacts/:id/read', requireAdmin, (req, res) => {
  const submission = contactSubmissions.get(req.params.id);
  
  if (!submission) {
    return res.status(404).json({ error: 'Contact submission not found' });
  }
  
  submission.isRead = true;
  contactSubmissions.set(req.params.id, submission);
  
  res.json({ success: true, submission });
});

app.delete('/admin/contacts/:id', requireAdmin, (req, res) => {
  const submission = contactSubmissions.get(req.params.id);
  
  if (!submission) {
    return res.status(404).json({ error: 'Contact submission not found' });
  }
  
  contactSubmissions.delete(req.params.id);
  res.json({ success: true, message: 'Contact submission deleted successfully' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});