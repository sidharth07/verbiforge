const fs = require('fs');
const path = require('path');

async function testPersistence() {
    console.log('🧪 Testing persistent disk and database location...');
    
    try {
        // Test 1: Check environment variables
        console.log('\n1. Environment Variables:');
        console.log('NODE_ENV:', process.env.NODE_ENV);
        console.log('DATABASE_PATH:', process.env.DATABASE_PATH);
        console.log('DATABASE_URL:', process.env.DATABASE_URL);
        
        // Test 2: Check current working directory
        console.log('\n2. Current Working Directory:');
        console.log('process.cwd():', process.cwd());
        console.log('__dirname:', __dirname);
        
        // Test 3: Test different possible database paths
        console.log('\n3. Testing Database Paths:');
        
        const possiblePaths = [
            process.env.DATABASE_PATH,
            '/opt/render/project/src/data',
            path.join(__dirname, 'data'),
            path.join(process.cwd(), 'data')
        ];
        
        for (const testPath of possiblePaths) {
            if (testPath) {
                console.log(`\nTesting path: ${testPath}`);
                console.log('Path exists:', fs.existsSync(testPath));
                
                if (fs.existsSync(testPath)) {
                    try {
                        const stats = fs.statSync(testPath);
                        console.log('Is directory:', stats.isDirectory());
                        console.log('Is file:', stats.isFile());
                        console.log('Permissions:', stats.mode.toString(8));
                        
                        if (stats.isDirectory()) {
                            const contents = fs.readdirSync(testPath);
                            console.log('Directory contents:', contents);
                            
                            // Check for database file
                            const dbFile = path.join(testPath, 'verbiforge.db');
                            if (fs.existsSync(dbFile)) {
                                const dbStats = fs.statSync(dbFile);
                                const fileSizeInMB = dbStats.size / (1024 * 1024);
                                console.log(`Database file found: ${fileSizeInMB.toFixed(2)} MB`);
                                console.log('Database last modified:', dbStats.mtime);
                            } else {
                                console.log('No database file found in this directory');
                            }
                        }
                    } catch (error) {
                        console.log('Error accessing path:', error.message);
                    }
                }
            }
        }
        
        // Test 4: Try to create a test file in the persistent directory
        console.log('\n4. Testing File Creation:');
        
        let testDir = null;
        if (process.env.DATABASE_PATH && fs.existsSync(process.env.DATABASE_PATH)) {
            testDir = process.env.DATABASE_PATH;
        } else if (fs.existsSync('/opt/render/project/src/data')) {
            testDir = '/opt/render/project/src/data';
        } else {
            testDir = path.join(__dirname, 'data');
        }
        
        console.log('Using test directory:', testDir);
        
        const testFile = path.join(testDir, 'persistence_test.txt');
        const testContent = `Persistence test at ${new Date().toISOString()}`;
        
        try {
            fs.writeFileSync(testFile, testContent);
            console.log('✅ Test file created successfully');
            
            // Read it back
            const readContent = fs.readFileSync(testFile, 'utf8');
            if (readContent === testContent) {
                console.log('✅ Test file read successfully - persistence working');
            } else {
                console.log('❌ Test file content mismatch - persistence issue');
            }
            
            // Clean up
            fs.unlinkSync(testFile);
            console.log('✅ Test file cleaned up');
            
        } catch (error) {
            console.log('❌ Error with test file:', error.message);
        }
        
        console.log('\n✅ Persistence test completed!');
        
    } catch (error) {
        console.error('❌ Persistence test failed:', error);
        console.error('Error stack:', error.stack);
    }
}

// Run the test
testPersistence();
