const { dbHelpers } = require('./database');

async function addSecondAdmin() {
    try {
        console.log('👤 Adding second super admin (Google SSO)...');
        
        // Check if admin already exists
        const existingAdmin = await dbHelpers.get(
            'SELECT email FROM admin_users WHERE email = ? AND is_super_admin = TRUE',
            ['sid.bandewar@gmail.com']
        );
        
        if (existingAdmin) {
            console.log('ℹ️ Google SSO super admin already exists');
            return;
        }
        
        // Add the second super admin
        const result = await dbHelpers.run(
            'INSERT INTO admin_users (email, name, is_super_admin, created_by) VALUES (?, ?, ?, ?)',
            ['sid.bandewar@gmail.com', 'Sid Bandewar (Google SSO)', true, 'system']
        );
        
        if (result.changes > 0) {
            console.log('✅ Google SSO super admin added successfully');
        } else {
            console.log('ℹ️ Failed to add Google SSO super admin');
        }
        
        // List all admin users
        const admins = await dbHelpers.query('SELECT email, name, is_super_admin FROM admin_users');
        console.log('👑 Current admin users:');
        admins.forEach(admin => {
            console.log(`  - ${admin.email} (${admin.name}) - Super Admin: ${admin.is_super_admin ? 'Yes' : 'No'}`);
        });
        
    } catch (error) {
        console.error('❌ Error adding second admin:', error);
    }
}

// Run the function
addSecondAdmin();
