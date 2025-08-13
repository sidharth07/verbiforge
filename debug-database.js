const fs = require('fs');
const path = require('path');

console.log('🔍 DATABASE PERSISTENCE DIAGNOSTIC');
console.log('=====================================');

// Environment check
console.log('\n📋 ENVIRONMENT:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);

// Database directory logic
console.log('\n📁 DATABASE DIRECTORY LOGIC:');
let dbDir;

if (process.env.NODE_ENV === 'production') {
    if (process.env.DATABASE_PATH) {
        dbDir = process.env.DATABASE_PATH;
        console.log('✅ Using DATABASE_PATH from environment:', dbDir);
    } else {
        const renderDataPath = '/opt/render/project/src/data';
        if (fs.existsSync(renderDataPath)) {
            dbDir = renderDataPath;
            console.log('✅ Using Render persistent disk path:', dbDir);
        } else {
            dbDir = path.join(__dirname, 'data');
            console.log('⚠️ Render path not found, using fallback:', dbDir);
        }
    }
} else {
    dbDir = path.join(__dirname, 'data');
    console.log('✅ Development: Using local data directory:', dbDir);
}

console.log('Final database directory:', dbDir);

// Check directory existence and permissions
console.log('\n📁 DIRECTORY CHECK:');
console.log('Directory exists:', fs.existsSync(dbDir));
if (fs.existsSync(dbDir)) {
    try {
        const stats = fs.statSync(dbDir);
        console.log('Directory is directory:', stats.isDirectory());
        console.log('Directory permissions:', stats.mode.toString(8));
        console.log('Directory owner:', stats.uid);
        console.log('Directory group:', stats.gid);
        
        // Check if writable
        fs.accessSync(dbDir, fs.constants.W_OK);
        console.log('✅ Directory is writable');
        
        // List contents
        const contents = fs.readdirSync(dbDir);
        console.log('Directory contents:', contents);
        
        // Check for database file
        const dbPath = path.join(dbDir, 'verbiforge.db');
        console.log('\n🗄️ DATABASE FILE CHECK:');
        console.log('Database path:', dbPath);
        console.log('Database file exists:', fs.existsSync(dbPath));
        
        if (fs.existsSync(dbPath)) {
            const dbStats = fs.statSync(dbPath);
            console.log('Database file size:', dbStats.size, 'bytes');
            console.log('Database file last modified:', dbStats.mtime);
            console.log('Database file permissions:', dbStats.mode.toString(8));
            
            // Check if database is readable
            try {
                fs.accessSync(dbPath, fs.constants.R_OK);
                console.log('✅ Database file is readable');
            } catch (error) {
                console.log('❌ Database file is not readable');
            }
            
            // Check if database is writable
            try {
                fs.accessSync(dbPath, fs.constants.W_OK);
                console.log('✅ Database file is writable');
            } catch (error) {
                console.log('❌ Database file is not writable');
            }
        }
        
    } catch (error) {
        console.error('❌ Error checking directory:', error.message);
    }
} else {
    console.log('❌ Directory does not exist');
    
    // Try to create it
    console.log('\n🔧 ATTEMPTING TO CREATE DIRECTORY:');
    try {
        fs.mkdirSync(dbDir, { recursive: true, mode: 0o755 });
        console.log('✅ Directory created successfully');
        
        // Check if it's writable
        fs.accessSync(dbDir, fs.constants.W_OK);
        console.log('✅ New directory is writable');
    } catch (error) {
        console.error('❌ Failed to create directory:', error.message);
    }
}

// Check for any .gitignore issues
console.log('\n🔍 GIT IGNORE CHECK:');
try {
    const gitignorePath = path.join(__dirname, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        const lines = gitignoreContent.split('\n');
        
        console.log('data/ in .gitignore:', lines.some(line => line.trim() === 'data/'));
        console.log('*.db in .gitignore:', lines.some(line => line.trim() === '*.db'));
        
        // Check for conflicting rules
        const hasDataIgnore = lines.some(line => line.trim() === 'data/');
        const hasDataInclude = lines.some(line => line.trim() === '!data/');
        
        if (hasDataIgnore && hasDataInclude) {
            console.log('⚠️ CONFLICT: Both data/ and !data/ found in .gitignore');
        } else if (hasDataIgnore) {
            console.log('✅ data/ is properly ignored');
        } else {
            console.log('❌ data/ is NOT ignored');
        }
    } else {
        console.log('❌ .gitignore file not found');
    }
} catch (error) {
    console.error('❌ Error reading .gitignore:', error.message);
}

// Check if database is being tracked by git
console.log('\n🔍 GIT TRACKING CHECK:');
try {
    const { execSync } = require('child_process');
    const dbPath = path.join(dbDir, 'verbiforge.db');
    
    if (fs.existsSync(dbPath)) {
        try {
            const gitStatus = execSync(`git status --porcelain "${dbPath}"`, { encoding: 'utf8' });
            console.log('Git status of database file:', gitStatus.trim() || 'Not tracked');
            
            if (gitStatus.trim()) {
                console.log('⚠️ WARNING: Database file is being tracked by git!');
                console.log('This could cause database resets on deployment.');
            } else {
                console.log('✅ Database file is not tracked by git');
            }
        } catch (error) {
            console.log('Git status check failed (might not be in git repo):', error.message);
        }
    }
} catch (error) {
    console.log('Git check skipped:', error.message);
}

console.log('\n🔍 DIAGNOSTIC COMPLETE');
console.log('=====================================');
