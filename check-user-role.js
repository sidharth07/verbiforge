require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkAndFixUserRole() {
    try {
        console.log('🔍 Checking user role for sid@verbiforge.com...');
        
        // Check current user
        const result = await pool.query('SELECT id, email, name, role FROM users WHERE email = $1', ['sid@verbiforge.com']);
        
        if (result.rows.length === 0) {
            console.log('❌ User sid@verbiforge.com not found!');
            return;
        }
        
        const user = result.rows[0];
        console.log('👤 Current user info:', user);
        
        if (user.role === 'super_admin') {
            console.log('✅ User already has super_admin role');
        } else if (user.role === 'admin') {
            console.log('✅ User has admin role');
        } else {
            console.log('❌ User has role:', user.role, '- Updating to super_admin...');
            
            // Update to super_admin
            await pool.query('UPDATE users SET role = $1 WHERE email = $2', ['super_admin', 'sid@verbiforge.com']);
            console.log('✅ Updated user role to super_admin');
            
            // Verify the update
            const updatedResult = await pool.query('SELECT id, email, name, role FROM users WHERE email = $1', ['sid@verbiforge.com']);
            console.log('✅ Updated user info:', updatedResult.rows[0]);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkAndFixUserRole();
