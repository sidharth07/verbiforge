const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🔧 FORCING DATABASE PERSISTENCE');
console.log('================================');

// Determine the correct database path
function getDatabasePath() {
    // Priority order for database location
    const paths = [
        process.env.DATABASE_PATH,
        '/opt/render/project/src/data',
        path.join(__dirname, 'data')
    ].filter(Boolean);
    
    for (const basePath of paths) {
        if (fs.existsSync(basePath) || basePath.includes('/opt/render')) {
            const dbPath = path.join(basePath, 'verbiforge.db');
            console.log(`🎯 Selected database path: ${dbPath}`);
            return { basePath, dbPath };
        }
    }
    
    // Fallback to local data directory
    const fallbackPath = path.join(__dirname, 'data');
    const fallbackDbPath = path.join(fallbackPath, 'verbiforge.db');
    console.log(`⚠️ Using fallback database path: ${fallbackDbPath}`);
    return { basePath: fallbackPath, dbPath: fallbackDbPath };
}

// Ensure directory exists
function ensureDirectory(dirPath) {
    console.log(`📁 Ensuring directory exists: ${dirPath}`);
    
    if (!fs.existsSync(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
            console.log(`✅ Created directory: ${dirPath}`);
        } catch (error) {
            console.error(`❌ Failed to create directory: ${error.message}`);
            throw error;
        }
    } else {
        console.log(`✅ Directory already exists: ${dirPath}`);
    }
    
    // Test write permissions
    try {
        const testFile = path.join(dirPath, '.test-write');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log(`✅ Directory is writable: ${dirPath}`);
    } catch (error) {
        console.error(`❌ Directory is not writable: ${error.message}`);
        throw error;
    }
}

// Create a fresh database with all tables and admin users
function createFreshDatabase(dbPath) {
    console.log(`🗄️ Creating fresh database at: ${dbPath}`);
    
    return new Promise((resolve, reject) => {
        // Remove existing database if it exists
        if (fs.existsSync(dbPath)) {
            console.log(`🗑️ Removing existing database: ${dbPath}`);
            fs.unlinkSync(dbPath);
        }
        
        // Create new database
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error(`❌ Error creating database: ${err.message}`);
                reject(err);
                return;
            }
            
            console.log(`✅ Database created successfully: ${dbPath}`);
            
            // Enable WAL mode for better concurrency
            db.run('PRAGMA journal_mode = WAL', (err) => {
                if (err) {
                    console.warn(`⚠️ Could not enable WAL mode: ${err.message}`);
                } else {
                    console.log('✅ WAL mode enabled');
                }
            });
            
            // Create tables
            const createTables = `
                -- Users table
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name TEXT NOT NULL,
                    role TEXT DEFAULT 'user',
                    google_id TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Projects table
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
                    notes TEXT,
                    submitted_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users (id)
                );
                
                -- Admin users table
                CREATE TABLE IF NOT EXISTS admin_users (
                    email TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    temp_password TEXT,
                    is_super_admin BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT NOT NULL
                );
                
                -- Contact submissions table
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
                );
                
                -- Settings table
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                
                -- Migrations table
                CREATE TABLE IF NOT EXISTS migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    migration_name TEXT UNIQUE NOT NULL,
                    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `;
            
            db.exec(createTables, (err) => {
                if (err) {
                    console.error(`❌ Error creating tables: ${err.message}`);
                    reject(err);
                    return;
                }
                
                console.log('✅ All tables created successfully');
                
                // Insert default admin users
                const insertAdmins = `
                    INSERT OR IGNORE INTO admin_users (email, name, is_super_admin, created_by) 
                    VALUES 
                        ('sid@verbiforge.com', 'Super Admin', TRUE, 'system'),
                        ('sid.bandewar@gmail.com', 'Sid Bandewar (Google SSO)', TRUE, 'system');
                `;
                
                db.exec(insertAdmins, (err) => {
                    if (err) {
                        console.error(`❌ Error inserting admin users: ${err.message}`);
                        reject(err);
                        return;
                    }
                    
                    console.log('✅ Admin users created successfully');
                    
                    // Insert default language settings
                    const insertSettings = `
                        INSERT OR IGNORE INTO settings (key, value) VALUES 
                        ('default_languages', '{"English": 25, "Spanish": 35, "French": 35, "German": 45, "Portuguese": 35, "Italian": 35, "Dutch": 40, "Russian": 40, "Chinese": 35, "Japanese": 35, "Korean": 40, "Arabic": 50, "Hindi": 35, "Bengali": 40, "Urdu": 40, "Turkish": 40, "Polish": 40, "Czech": 40, "Hungarian": 40, "Swedish": 40, "Norwegian": 40, "Danish": 40, "Finnish": 45, "Greek": 40, "Hebrew": 30, "Thai": 40, "Vietnamese": 40, "Indonesian": 35, "Malay": 35, "Filipino": 35, "Swahili": 45}'),
                        ('project_management_cost', '500'),
                        ('pure_translation_multiplier', '1.5');
                    `;
                    
                    db.exec(insertSettings, (err) => {
                        if (err) {
                            console.error(`❌ Error inserting settings: ${err.message}`);
                            reject(err);
                            return;
                        }
                        
                        console.log('✅ Default settings created successfully');
                        
                        // Verify the database
                        db.get('SELECT COUNT(*) as admin_count FROM admin_users', (err, result) => {
                            if (err) {
                                console.error(`❌ Error verifying admin users: ${err.message}`);
                                reject(err);
                                return;
                            }
                            
                            console.log(`✅ Database verification: ${result.admin_count} admin users found`);
                            
                            db.close((err) => {
                                if (err) {
                                    console.error(`❌ Error closing database: ${err.message}`);
                                    reject(err);
                                    return;
                                }
                                
                                console.log('✅ Database closed successfully');
                                
                                // Verify file exists and has content
                                if (fs.existsSync(dbPath)) {
                                    const stats = fs.statSync(dbPath);
                                    const sizeInMB = stats.size / (1024 * 1024);
                                    console.log(`✅ Database file verified: ${sizeInMB.toFixed(2)} MB`);
                                    
                                    if (sizeInMB > 0.001) {
                                        console.log('✅ Database file has content');
                                        resolve(dbPath);
                                    } else {
                                        console.error('❌ Database file is empty');
                                        reject(new Error('Database file is empty'));
                                    }
                                } else {
                                    console.error('❌ Database file does not exist after creation');
                                    reject(new Error('Database file not found after creation'));
                                }
                            });
                        });
                    });
                });
            });
        });
    });
}

// Main execution
async function main() {
    try {
        console.log('🚀 Starting database persistence fix...');
        
        // Get the correct database path
        const { basePath, dbPath } = getDatabasePath();
        
        // Ensure directory exists
        ensureDirectory(basePath);
        
        // Create fresh database
        await createFreshDatabase(dbPath);
        
        console.log('\n🎉 DATABASE PERSISTENCE FIX COMPLETED SUCCESSFULLY!');
        console.log('==================================================');
        console.log(`🗄️ Database location: ${dbPath}`);
        console.log(`📊 Database size: ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(2)} MB`);
        console.log('👑 Admin users: sid@verbiforge.com, sid.bandewar@gmail.com');
        console.log('✅ All tables created and populated');
        console.log('✅ Database is ready for use');
        
        // Test database connection
        console.log('\n🧪 Testing database connection...');
        const testDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                console.error(`❌ Test connection failed: ${err.message}`);
            } else {
                console.log('✅ Test connection successful');
                testDb.get('SELECT COUNT(*) as count FROM admin_users', (err, result) => {
                    if (err) {
                        console.error(`❌ Test query failed: ${err.message}`);
                    } else {
                        console.log(`✅ Test query successful: ${result.count} admin users found`);
                    }
                    testDb.close();
                });
            }
        });
        
    } catch (error) {
        console.error('\n❌ DATABASE PERSISTENCE FIX FAILED!');
        console.error('====================================');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the script
main();
