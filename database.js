const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Create database directory if it doesn't exist
// Use environment variable for database path or default to local data directory
let dbDir = process.env.DATABASE_PATH || path.join(__dirname, 'data');

// In production (Render), ensure we're using the persistent disk
if (process.env.NODE_ENV === 'production') {
    // If DATABASE_PATH is not set, try to use the Render persistent disk path
    if (!process.env.DATABASE_PATH) {
        const renderDataPath = '/opt/render/project/src/data';
        if (fs.existsSync(renderDataPath)) {
            dbDir = renderDataPath;
            console.log('🌐 Production environment detected, using Render persistent disk path');
        } else {
            console.log('⚠️ Render persistent disk path not found, using fallback');
        }
    }
}
console.log('🔍 Database directory:', dbDir);
console.log('🔍 Environment DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('🔍 Current working directory:', process.cwd());
console.log('🔍 __dirname:', __dirname);

if (!fs.existsSync(dbDir)) {
    console.log('📁 Creating database directory:', dbDir);
    try {
        fs.mkdirSync(dbDir, { recursive: true });
        console.log('✅ Database directory created successfully');
    } catch (error) {
        console.error('❌ Error creating database directory:', error);
        throw error;
    }
} else {
    console.log('📁 Database directory already exists:', dbDir);
    // Check if directory is writable
    try {
        fs.accessSync(dbDir, fs.constants.W_OK);
        console.log('✅ Database directory is writable');
    } catch (error) {
        console.error('❌ Database directory is not writable:', error);
        throw error;
    }
}

const dbPath = path.join(dbDir, 'verbiforge.db');
console.log('🗄️ Database path:', dbPath);
console.log('🗄️ Database file exists:', fs.existsSync(dbPath));

// Initialize database
console.log('🗄️ Attempting to connect to database at:', dbPath);
console.log('🗄️ Database file exists before connection:', fs.existsSync(dbPath));

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err);
        console.error('❌ Database path:', dbPath);
        console.error('❌ Error details:', err.message);
        throw err;
    } else {
        console.log('✅ Connected to SQLite database at:', dbPath);
        console.log('✅ Database file exists after connection:', fs.existsSync(dbPath));
    }
});

function initializeTables() {
    return new Promise((resolve, reject) => {
        // Users table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
                reject(err);
                return;
            }
            
            // Projects table
            db.run(`
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    name TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_path TEXT,
                    translated_file_path TEXT,
                    translated_file_name TEXT,
                    project_type TEXT DEFAULT 'fusion',
                    multiplier REAL DEFAULT 1,
                    word_count INTEGER NOT NULL,
                    breakdown TEXT NOT NULL,
                    subtotal REAL NOT NULL,
                    project_management_cost REAL DEFAULT 500,
                    total REAL NOT NULL,
                    status TEXT DEFAULT 'quote_generated',
                    eta INTEGER,
                    submitted_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating projects table:', err);
                    reject(err);
                    return;
                }
                
                // Admin users table
                db.run(`
                    CREATE TABLE IF NOT EXISTS admin_users (
                        email TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        temp_password TEXT,
                        is_super_admin BOOLEAN DEFAULT FALSE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        created_by TEXT NOT NULL
                    )
                `, (err) => {
                    if (err) {
                        console.error('Error creating admin_users table:', err);
                        reject(err);
                        return;
                    }
                    
                    // Contact submissions table
                    db.run(`
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
                    `, (err) => {
                        if (err) {
                            console.error('Error creating contact_submissions table:', err);
                            reject(err);
                            return;
                        }
                        
                        // Settings table for dynamic configuration
                        db.run(`
                            CREATE TABLE IF NOT EXISTS settings (
                                key TEXT PRIMARY KEY,
                                value TEXT NOT NULL,
                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )
                        `, (err) => {
                            if (err) {
                                console.error('Error creating settings table:', err);
                                reject(err);
                                return;
                            }
                            
                            // Insert default settings
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
                            
                            db.run(`
                                INSERT OR IGNORE INTO settings (key, value) VALUES 
                                ('project_type_multiplier', '1.3'),
                                ('languages', ?)
                            `, [JSON.stringify(defaultLanguages)], (err) => {
                                if (err) {
                                    console.error('Error inserting default settings:', err);
                                    reject(err);
                                    return;
                                }
                                
                                // Insert default super admin
                                console.log('👤 Inserting default super admin...');
                                db.run(`
                                    INSERT OR IGNORE INTO admin_users (email, name, is_super_admin, created_by) 
                                    VALUES ('sid@verbiforge.com', 'Super Admin', TRUE, 'system')
                                `, function(err) {
                                    if (err) {
                                        console.error('❌ Error inserting default admin:', err);
                                        reject(err);
                                        return;
                                    }
                                    
                                    if (this.changes > 0) {
                                        console.log('✅ Default super admin created successfully');
                                    } else {
                                        console.log('ℹ️ Default super admin already exists');
                                    }
                                    
                                    console.log('✅ Database tables initialized successfully');
                                    
                                    // Check if there are any existing users
                                    db.get('SELECT COUNT(*) as count FROM users', (err, result) => {
                                        if (err) {
                                            console.error('❌ Error checking user count:', err);
                                        } else {
                                            console.log(`👥 Current user count: ${result.count}`);
                                        }
                                    });
                                    
                                    // Check if there are any existing admin users
                                    db.get('SELECT COUNT(*) as count FROM admin_users', (err, result) => {
                                        if (err) {
                                            console.error('❌ Error checking admin count:', err);
                                        } else {
                                            console.log(`👑 Current admin count: ${result.count}`);
                                        }
                                    });
                                    
                                    resolve();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}

// Database helper functions
const dbHelpers = {
    // Generic query function
    query: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    },

    // Generic run function for INSERT/UPDATE/DELETE
    run: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },

    // Get single row
    get: (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
};

// Database backup and restore functions
async function backupDatabase() {
    const backupPath = path.join(dbDir, 'verbiforge_backup.db');
    try {
        // Create a backup by copying the database file
        const fsPromises = require('fs/promises');
        await fsPromises.copyFile(dbPath, backupPath);
        console.log('✅ Database backup created at:', backupPath);
        return backupPath;
    } catch (error) {
        console.error('❌ Error creating database backup:', error);
        throw error;
    }
}

async function restoreDatabase() {
    const backupPath = path.join(dbDir, 'verbiforge_backup.db');
    try {
        if (fs.existsSync(backupPath)) {
            const fsPromises = require('fs/promises');
            await fsPromises.copyFile(backupPath, dbPath);
            console.log('✅ Database restored from backup');
            return true;
        } else {
            console.log('ℹ️ No backup file found to restore');
            return false;
        }
    } catch (error) {
        console.error('❌ Error restoring database:', error);
        throw error;
    }
}

module.exports = { db, dbHelpers, initializeTables, backupDatabase, restoreDatabase };