require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function forceFixUserRole() {
    try {
        console.log('🔧 Force fixing user role for sid@verbiforge.com...');
        
        // First, check current user
        const checkResult = await pool.query('SELECT id, email, name, role FROM users WHERE email = $1', ['sid@verbiforge.com']);
        
        if (checkResult.rows.length === 0) {
            console.log('❌ User sid@verbiforge.com not found!');
            return;
        }
        
        const currentUser = checkResult.rows[0];
        console.log('👤 Current user info:', currentUser);
        
        if (currentUser.role === 'super_admin') {
            console.log('✅ User already has super_admin role');
            return;
        }
        
        console.log(`🔄 Updating role from "${currentUser.role}" to "super_admin"...`);
        
        // Force update to super_admin
        const updateResult = await pool.query(
            'UPDATE users SET role = $1 WHERE email = $2 RETURNING id, email, name, role',
            ['super_admin', 'sid@verbiforge.com']
        );
        
        if (updateResult.rowCount === 0) {
            console.log('❌ Failed to update user role');
            return;
        }
        
        const updatedUser = updateResult.rows[0];
        console.log('✅ Successfully updated user role!');
        console.log('👤 Updated user info:', updatedUser);
        
        // Verify the update
        const verifyResult = await pool.query('SELECT id, email, name, role FROM users WHERE email = $1', ['sid@verbiforge.com']);
        console.log('🔍 Verification - Current user info:', verifyResult.rows[0]);
        
        console.log('🎉 User role fix completed successfully!');
        console.log('🚀 You can now access the admin panel at: https://www.verbiforge.com/admin.html');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

forceFixUserRole();
