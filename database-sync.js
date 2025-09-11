#!/usr/bin/env node

/**
 * Database Sync Script for VerbiForge
 * Syncs production database to staging database
 * Run this script periodically to keep staging in sync with production
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Environment variables
const PRODUCTION_DB_URL = process.env.PRODUCTION_DATABASE_URL;
const STAGING_DB_URL = process.env.STAGING_DATABASE_URL;

// Tables to sync (in order of dependencies)
const TABLES_TO_SYNC = [
    'users',
    'user_relationships', 
    'projects',
    'files',
    'translations',
    'email_templates',
    'settings',
    'contacts'
];

// Sensitive fields to anonymize in staging
const SENSITIVE_FIELDS = {
    users: ['email', 'password_hash'],
    contacts: ['email', 'message']
};

class DatabaseSync {
    constructor() {
        this.productionClient = null;
        this.stagingClient = null;
        this.syncLog = [];
    }

    async connect() {
        try {
            console.log('🔌 Connecting to databases...');
            
            this.productionClient = new Client({
                connectionString: PRODUCTION_DB_URL,
                ssl: { rejectUnauthorized: false }
            });
            
            this.stagingClient = new Client({
                connectionString: STAGING_DB_URL,
                ssl: { rejectUnauthorized: false }
            });

            await this.productionClient.connect();
            await this.stagingClient.connect();
            
            console.log('✅ Connected to both databases');
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.productionClient) await this.productionClient.end();
            if (this.stagingClient) await this.stagingClient.end();
            console.log('🔌 Disconnected from databases');
        } catch (error) {
            console.error('❌ Error disconnecting:', error.message);
        }
    }

    async clearStagingTable(tableName) {
        try {
            // Disable foreign key checks temporarily
            await this.stagingClient.query('SET session_replication_role = replica;');
            await this.stagingClient.query(`DELETE FROM ${tableName};`);
            await this.stagingClient.query('SET session_replication_role = DEFAULT;');
            
            console.log(`🗑️  Cleared staging table: ${tableName}`);
        } catch (error) {
            console.error(`❌ Error clearing table ${tableName}:`, error.message);
            throw error;
        }
    }

    async syncTable(tableName) {
        try {
            console.log(`📊 Syncing table: ${tableName}`);
            
            // Get data from production
            const result = await this.productionClient.query(`SELECT * FROM ${tableName}`);
            const rows = result.rows;
            
            if (rows.length === 0) {
                console.log(`ℹ️  No data in production table: ${tableName}`);
                return;
            }

            // Clear staging table
            await this.clearStagingTable(tableName);

            // Anonymize sensitive data if needed
            const anonymizedRows = this.anonymizeData(tableName, rows);

            // Insert data into staging
            if (anonymizedRows.length > 0) {
                const columns = Object.keys(anonymizedRows[0]);
                const values = anonymizedRows.map(row => 
                    columns.map(col => row[col])
                );

                const placeholders = columns.map((_, i) => 
                    `$${i + 1}`
                ).join(', ');

                const query = `
                    INSERT INTO ${tableName} (${columns.join(', ')})
                    VALUES (${placeholders})
                `;

                for (const valueSet of values) {
                    await this.stagingClient.query(query, valueSet);
                }
            }

            console.log(`✅ Synced ${anonymizedRows.length} rows to staging table: ${tableName}`);
            this.syncLog.push({
                table: tableName,
                rows: anonymizedRows.length,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`❌ Error syncing table ${tableName}:`, error.message);
            throw error;
        }
    }

    anonymizeData(tableName, rows) {
        const sensitiveFields = SENSITIVE_FIELDS[tableName] || [];
        
        if (sensitiveFields.length === 0) {
            return rows;
        }

        return rows.map(row => {
            const anonymizedRow = { ...row };
            
            sensitiveFields.forEach(field => {
                if (anonymizedRow[field]) {
                    if (field === 'email') {
                        // Anonymize email: user@domain.com -> user+staging@domain.com
                        anonymizedRow[field] = anonymizedRow[field].replace('@', '+staging@');
                    } else if (field === 'password_hash') {
                        // Keep password hashes for testing
                        anonymizedRow[field] = anonymizedRow[field];
                    } else if (field === 'message') {
                        // Anonymize contact messages
                        anonymizedRow[field] = '[STAGING DATA - ANONYMIZED]';
                    }
                }
            });
            
            return anonymizedRow;
        });
    }

    async syncAllTables() {
        try {
            console.log('🚀 Starting database sync...');
            console.log(`📋 Tables to sync: ${TABLES_TO_SYNC.join(', ')}`);
            
            for (const tableName of TABLES_TO_SYNC) {
                await this.syncTable(tableName);
            }

            console.log('✅ Database sync completed successfully!');
            this.logSyncResults();
            
        } catch (error) {
            console.error('❌ Database sync failed:', error.message);
            throw error;
        }
    }

    logSyncResults() {
        const logData = {
            timestamp: new Date().toISOString(),
            totalTables: this.syncLog.length,
            totalRows: this.syncLog.reduce((sum, log) => sum + log.rows, 0),
            tables: this.syncLog
        };

        // Save sync log
        const logFile = path.join(__dirname, 'sync-logs', `sync-${Date.now()}.json`);
        const logDir = path.dirname(logFile);
        
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
        
        console.log('📝 Sync log saved:', logFile);
        console.log(`📊 Total rows synced: ${logData.totalRows}`);
    }

    async run() {
        try {
            await this.connect();
            await this.syncAllTables();
        } catch (error) {
            console.error('❌ Sync process failed:', error);
            process.exit(1);
        } finally {
            await this.disconnect();
        }
    }
}

// Run the sync if this script is executed directly
if (require.main === module) {
    const sync = new DatabaseSync();
    sync.run();
}

module.exports = DatabaseSync;
