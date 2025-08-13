const { dbHelpers, initializeTables, runMigrations, createAutomaticBackup } = require('./database');
const authManager = require('./auth');

async function testDatabasePersistence() {
    console.log('🧪 Testing database persistence...');
    
    try {
        // Check initial health
        console.log('\n1. Initial database health check:');
        const initialHealth = await dbHelpers.checkDatabaseHealth();
        console.log(initialHealth);
        
        // Initialize tables
        console.log('\n2. Initializing tables:');
        await initializeTables();
        
        // Run migrations
        console.log('\n3. Running migrations:');
        await runMigrations();
        
        // Create a test user
        console.log('\n4. Creating test user:');
        const testUser = await authManager.createUser('test@example.com', 'password123', 'Test User');
        console.log('Test user created:', testUser);
        
        // Check user count
        console.log('\n5. Checking user count:');
        const userCount = await dbHelpers.get('SELECT COUNT(*) as count FROM users');
        console.log('User count:', userCount.count);
        
        // Check admin count
        console.log('\n6. Checking admin count:');
        const adminCount = await dbHelpers.get('SELECT COUNT(*) as count FROM admin_users');
        console.log('Admin count:', adminCount.count);
        
        // List all users
        console.log('\n7. Listing all users:');
        const users = await dbHelpers.query('SELECT id, email, name, role, created_at FROM users');
        console.log('Users:', users);
        
        // List all admins
        console.log('\n8. Listing all admins:');
        const admins = await dbHelpers.query('SELECT email, name, is_super_admin, created_at FROM admin_users');
        console.log('Admins:', admins);
        
        // Final health check
        console.log('\n9. Final database health check:');
        const finalHealth = await dbHelpers.checkDatabaseHealth();
        console.log(finalHealth);
        
        console.log('\n✅ Database persistence test completed successfully!');
        
    } catch (error) {
        console.error('❌ Database persistence test failed:', error);
        console.error('Error stack:', error.stack);
    }
}

// Run the test
testDatabasePersistence();
