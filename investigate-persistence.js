const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

console.log('🔍 COMPREHENSIVE DATABASE PERSISTENCE INVESTIGATION');
console.log('====================================================');

// Environment analysis
console.log('\n📋 ENVIRONMENT ANALYSIS:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DATABASE_PATH:', process.env.DATABASE_PATH);
console.log('DATABASE_URL:', process.env.DATABASE_URL);
console.log('Current working directory:', process.cwd());
console.log('__dirname:', __dirname);
console.log('Process ID:', process.pid);
console.log('Platform:', process.platform);

// Check all possible database paths
console.log('\n🗂️ CHECKING ALL POSSIBLE DATABASE PATHS:');

const possiblePaths = [
    '/opt/render/project/src/data/verbiforge.db',
    '/opt/render/project/src/data',
    path.join(__dirname, 'data', 'verbiforge.db'),
    path.join(__dirname, 'data'),
    process.env.DATABASE_PATH ? path.join(process.env.DATABASE_PATH, 'verbiforge.db') : null,
    process.env.DATABASE_URL ? process.env.DATABASE_URL : null,
    '/tmp/verbiforge.db',
    '/var/tmp/verbiforge.db'
].filter(Boolean);

possiblePaths.forEach((dbPath, index) => {
    console.log(`\n${index + 1}. Checking: ${dbPath}`);
    
    if (fs.existsSync(dbPath)) {
        try {
            const stats = fs.statSync(dbPath);
            if (stats.isDirectory()) {
                console.log(`   ✅ Directory exists`);
                console.log(`   📁 Size: ${stats.size} bytes`);
                console.log(`   📅 Modified: ${stats.mtime}`);
                console.log(`   🔐 Permissions: ${stats.mode.toString(8)}`);
                
                // List contents
                try {
                    const contents = fs.readdirSync(dbPath);
                    console.log(`   📋 Contents: ${contents.join(', ')}`);
                    
                    // Check for database file in directory
                    const dbFile = path.join(dbPath, 'verbiforge.db');
                    if (fs.existsSync(dbFile)) {
                        const dbStats = fs.statSync(dbFile);
                        console.log(`   🗄️ Database file found: ${(dbStats.size / 1024 / 1024).toFixed(2)} MB`);
                        console.log(`   📅 DB Modified: ${dbStats.mtime}`);
                    }
                } catch (readError) {
                    console.log(`   ❌ Cannot read directory: ${readError.message}`);
                }
            } else {
                console.log(`   ✅ File exists`);
                console.log(`   📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                console.log(`   📅 Modified: ${stats.mtime}`);
                console.log(`   🔐 Permissions: ${stats.mode.toString(8)}`);
                
                // Try to open the database
                try {
                    const testDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
                        if (err) {
                            console.log(`   ❌ Cannot open database: ${err.message}`);
                        } else {
                            console.log(`   ✅ Database can be opened`);
                            testDb.get('SELECT COUNT(*) as count FROM users', (err, result) => {
                                if (err) {
                                    console.log(`   ❌ Cannot query users: ${err.message}`);
                                } else {
                                    console.log(`   👥 Users in database: ${result.count}`);
                                }
                                testDb.close();
                            });
                        }
                    });
                } catch (dbError) {
                    console.log(`   ❌ Database test failed: ${dbError.message}`);
                }
            }
        } catch (error) {
            console.log(`   ❌ Error accessing: ${error.message}`);
        }
    } else {
        console.log(`   ❌ Does not exist`);
        
        // Try to create directory if it's a directory path
        if (dbPath.endsWith('/data') || dbPath.endsWith('data')) {
            try {
                fs.mkdirSync(dbPath, { recursive: true });
                console.log(`   ✅ Created directory: ${dbPath}`);
            } catch (mkdirError) {
                console.log(`   ❌ Cannot create directory: ${mkdirError.message}`);
            }
        }
    }
});

// Check file system permissions
console.log('\n🔐 FILE SYSTEM PERMISSIONS:');
try {
    const testDir = '/opt/render/project/src/data';
    if (fs.existsSync(testDir)) {
        fs.accessSync(testDir, fs.constants.R_OK | fs.constants.W_OK);
        console.log('✅ Render data directory is readable and writable');
        
        const testFile = path.join(testDir, 'test-write.txt');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        console.log('✅ Can write and delete files in Render data directory');
    } else {
        console.log('❌ Render data directory does not exist');
    }
} catch (error) {
    console.log('❌ Permission test failed:', error.message);
}

// Check if we're in a container/isolated environment
console.log('\n🐳 CONTAINER/ENVIRONMENT CHECK:');
try {
    if (fs.existsSync('/.dockerenv')) {
        console.log('✅ Running in Docker container');
    } else {
        console.log('ℹ️ Not running in Docker container');
    }
    
    if (fs.existsSync('/proc/1/cgroup')) {
        const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
        if (cgroup.includes('docker') || cgroup.includes('kubepods')) {
            console.log('✅ Running in containerized environment');
        } else {
            console.log('ℹ️ Not in containerized environment');
        }
    }
} catch (error) {
    console.log('ℹ️ Cannot determine container status');
}

// Check for any existing database connections or locks
console.log('\n🔒 DATABASE LOCK CHECK:');
const lockPaths = [
    '/opt/render/project/src/data/verbiforge.db-wal',
    '/opt/render/project/src/data/verbiforge.db-shm',
    path.join(__dirname, 'data', 'verbiforge.db-wal'),
    path.join(__dirname, 'data', 'verbiforge.db-shm')
];

lockPaths.forEach(lockPath => {
    if (fs.existsSync(lockPath)) {
        console.log(`⚠️ Database lock file found: ${lockPath}`);
        try {
            const stats = fs.statSync(lockPath);
            console.log(`   📊 Size: ${stats.size} bytes`);
            console.log(`   📅 Modified: ${stats.mtime}`);
        } catch (error) {
            console.log(`   ❌ Cannot access lock file: ${error.message}`);
        }
    }
});

// Check for any backup files
console.log('\n💾 BACKUP FILES CHECK:');
const backupPaths = [
    '/opt/render/project/src/data/verbiforge.db.backup',
    '/opt/render/project/src/data/verbiforge.db.bak',
    path.join(__dirname, 'data', 'verbiforge.db.backup'),
    path.join(__dirname, 'data', 'verbiforge.db.bak')
];

backupPaths.forEach(backupPath => {
    if (fs.existsSync(backupPath)) {
        console.log(`✅ Backup file found: ${backupPath}`);
        try {
            const stats = fs.statSync(backupPath);
            console.log(`   📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   📅 Modified: ${stats.mtime}`);
        } catch (error) {
            console.log(`   ❌ Cannot access backup: ${error.message}`);
        }
    }
});

// Check for any environment-specific issues
console.log('\n🌍 ENVIRONMENT-SPECIFIC CHECKS:');
console.log('User ID:', process.getuid ? process.getuid() : 'N/A');
console.log('Group ID:', process.getgid ? process.getgid() : 'N/A');
console.log('Home directory:', process.env.HOME || 'N/A');
console.log('Temp directory:', process.env.TMPDIR || '/tmp');

// Check for any mount points
console.log('\n📌 MOUNT POINTS CHECK:');
try {
    if (fs.existsSync('/proc/mounts')) {
        const mounts = fs.readFileSync('/proc/mounts', 'utf8');
        const renderMounts = mounts.split('\n').filter(line => line.includes('render') || line.includes('/opt/render'));
        if (renderMounts.length > 0) {
            console.log('✅ Render mount points found:');
            renderMounts.forEach(mount => console.log(`   ${mount}`));
        } else {
            console.log('ℹ️ No Render-specific mount points found');
        }
    }
} catch (error) {
    console.log('ℹ️ Cannot check mount points');
}

console.log('\n🔍 INVESTIGATION COMPLETE');
console.log('====================================================');
console.log('\n💡 RECOMMENDATIONS:');
console.log('1. Check if the database file exists in /opt/render/project/src/data/');
console.log('2. Verify the persistent disk is properly mounted');
console.log('3. Check if the database is being created in the wrong location');
console.log('4. Ensure the application has write permissions');
console.log('5. Look for any database corruption or lock files');
