#!/usr/bin/env node

const { dbHelpers, initializeTables, runMigrations } = require('./database');
const fs = require('fs');
const path = require('path');

async function testDatabasePersistence() {
    console.log('🧪 Testing Database Persistence...');
    console.log('=====================================');
    
    try {
        // Check environment
        console.log('🔍 Environment Check:');
        console.log('  - NODE_ENV:', process.env.NODE_ENV);
        console.log('  - DATABASE_PATH:', process.env.DATABASE_PATH);
        console.log('  - DATABASE_URL:', process.env.DATABASE_URL);
        console.log('  - Current working directory:', process.cwd());
        console.log('  - __dirname:', __dirname);
        
        // Check if database file exists
        const dbInfo = dbHelpers.getDatabaseInfo();
        console.log('\n🗄️ Database File Info:');
        console.log('  - Path:', dbInfo.path);
        console.log('  - Exists:', dbInfo.exists);
        console.log('  - Size:', dbInfo.size ? `${dbInfo.size.toFixed(2)} MB` : 'N/A');
        console.log('  - Last modified:', dbInfo.lastModified);
        
        // Check if data directory exists and is writable
        const dataDir = path.dirname(dbInfo.path);
        console.log('\n📁 Data Directory Check:');
        console.log('  - Directory:', dataDir);
        console.log('  - Exists:', fs.existsSync(dataDir));
        console.log('  - Writable:', fs.accessSync ? 'Checking...' : 'Unknown');
        
        try {
            fs.accessSync(dataDir, fs.constants.W_OK);
            console.log('  - ✅ Directory is writable');
        } catch (error) {
            console.log('  - ❌ Directory is not writable:', error.message);
        }
        
        // List contents of data directory
        if (fs.existsSync(dataDir)) {
            const contents = fs.readdirSync(dataDir);
            console.log('  - Contents:', contents);
        }
        
        // Initialize database
        console.log('\n🗄️ Initializing Database...');
        await initializeTables();
        console.log('✅ Database tables initialized');
        
        // Run migrations
        console.log('\n🔄 Running Migrations...');
        await runMigrations();
        console.log('✅ Migrations completed');
        
        // Check database health
        console.log('\n🔍 Database Health Check:');
        const healthCheck = await dbHelpers.checkDatabaseHealth();
        console.log('  - Healthy:', healthCheck.healthy);
        console.log('  - User count:', healthCheck.userCount);
        console.log('  - Admin count:', healthCheck.adminCount);
        console.log('  - Tables:', healthCheck.tables);
        
        // Verify persistence
        console.log('\n🔍 Persistence Verification:');
        const persistenceVerified = await dbHelpers.verifyPersistence();
        console.log('  - Persistence verified:', persistenceVerified);
        
        // Get final database info
        const finalDbInfo = dbHelpers.getDatabaseInfo();
        console.log('\n🗄️ Final Database Info:');
        console.log('  - Path:', finalDbInfo.path);
        console.log('  - Exists:', finalDbInfo.exists);
        console.log('  - Size:', finalDbInfo.size ? `${finalDbInfo.size.toFixed(2)} MB` : 'N/A');
        console.log('  - Last modified:', finalDbInfo.lastModified);
        
        // Test writing some data
        console.log('\n✍️ Testing Data Write...');
        const testUser = {
            email: 'test@example.com',
            name: 'Test User',
            password: 'testpassword123'
        };
        
        const result = await dbHelpers.run(
            'INSERT OR IGNORE INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)',
            [testUser.email, testUser.name, 'test_hash', new Date().toISOString()]
        );
        
        console.log('  - Insert result:', result);
        
        // Verify the data was written
        const users = await dbHelpers.query('SELECT COUNT(*) as count FROM users');
        console.log('  - Total users after insert:', users[0].count);
        
        console.log('\n✅ Database persistence test completed successfully!');
        
    } catch (error) {
        console.error('❌ Database persistence test failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
testDatabasePersistence();
