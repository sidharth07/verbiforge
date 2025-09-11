#!/usr/bin/env node

/**
 * Manual Database Sync Script for VerbiForge
 * Quick script to sync production to staging
 * Usage: node sync-staging.js
 */

require('dotenv').config();
const DatabaseSync = require('./database-sync');

async function main() {
    console.log('🔄 Manual Database Sync - Production to Staging');
    console.log('================================================');
    
    // Check environment variables
    if (!process.env.PRODUCTION_DATABASE_URL) {
        console.error('❌ PRODUCTION_DATABASE_URL not found in environment variables');
        process.exit(1);
    }
    
    if (!process.env.STAGING_DATABASE_URL) {
        console.error('❌ STAGING_DATABASE_URL not found in environment variables');
        process.exit(1);
    }
    
    console.log('✅ Environment variables found');
    console.log('🚀 Starting sync process...');
    
    const sync = new DatabaseSync();
    await sync.run();
    
    console.log('🎉 Manual sync completed successfully!');
}

main().catch(error => {
    console.error('❌ Manual sync failed:', error);
    process.exit(1);
});
