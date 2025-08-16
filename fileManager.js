const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Create secure directories
const UPLOAD_DIR = path.join(__dirname, 'secure-files', 'uploads');
const TRANSLATED_DIR = path.join(__dirname, 'secure-files', 'translated');

// Encryption key (in production, use environment variable)
const ENCRYPTION_KEY = process.env.FILE_ENCRYPTION_KEY || 'verbiforge-default-key-change-in-production';

class FileManager {
    constructor() {
        this.initializeDirectories();
    }

    async initializeDirectories() {
        try {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            await fs.mkdir(TRANSLATED_DIR, { recursive: true });
            console.log('Secure file directories initialized');
        } catch (error) {
            console.error('Error creating directories:', error);
        }
    }

    // Encrypt file content
    encryptFile(buffer) {
        try {
            console.log('Encryption: Starting encryption process');
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            console.log('Encryption: Key generated, length:', key.length);
            
            const iv = crypto.randomBytes(16);
            console.log('Encryption: IV generated, length:', iv.length);
            
            const cipher = crypto.createCipher(algorithm, key);
            console.log('Encryption: Cipher created');
            
            const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
            console.log('Encryption: Data encrypted, length:', encrypted.length);
            
            const result = Buffer.concat([iv, encrypted]);
            console.log('Encryption: Final result length:', result.length);
            
            return result;
        } catch (error) {
            console.error('Encryption: Error during encryption:', error);
            console.error('Encryption: Error stack:', error.stack);
            throw new Error(`File encryption failed: ${error.message}`);
        }
    }

    // Decrypt file content
    decryptFile(encryptedBuffer) {
        try {
            const algorithm = 'aes-256-cbc';
            const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
            const iv = encryptedBuffer.slice(0, 16);
            const encrypted = encryptedBuffer.slice(16);
            
            const decipher = crypto.createDecipher(algorithm, key);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
            
            return decrypted;
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('File decryption failed');
        }
    }

    // Save uploaded file securely
    async saveUploadedFile(file, projectId) {
        try {
            console.log('FileManager: Starting file save process');
            
            // Ensure directories exist
            await this.initializeDirectories();
            console.log('FileManager: Directories initialized');
            
            const fileName = `${projectId}_${Date.now()}_${file.originalname}`;
            const filePath = path.join(UPLOAD_DIR, fileName);
            console.log('FileManager: File path:', filePath);
            
            // Validate file
            if (!file || !file.buffer) {
                console.error('FileManager: Invalid file data - file:', !!file, 'buffer:', !!file?.buffer);
                throw new Error('Invalid file data');
            }
            
            console.log('FileManager: File validation passed, size:', file.buffer.length);
            
            // For now, save file without encryption to debug the issue
            console.log('FileManager: Saving file without encryption for debugging');
            await fs.writeFile(filePath, file.buffer);
            console.log('FileManager: File written successfully');
            
            return {
                filePath: fileName, // Store relative path only
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            };
        } catch (error) {
            console.error('FileManager: Error saving file:', error);
            console.error('FileManager: Error stack:', error.stack);
            throw new Error(`Failed to save file securely: ${error.message}`);
        }
    }

    // Save translated file
    async saveTranslatedFile(file, projectId) {
        try {
            console.log('FileManager: Starting translated file save process');
            
            // Ensure directories exist
            await this.initializeDirectories();
            console.log('FileManager: Directories initialized for translated file');
            
            const fileName = `translated_${projectId}_${Date.now()}_${file.originalname}`;
            const filePath = path.join(TRANSLATED_DIR, fileName);
            console.log('FileManager: Translated file path:', filePath);
            
            // Validate file - handle both buffer (memory storage) and path (disk storage)
            if (!file) {
                console.error('FileManager: No file provided');
                throw new Error('No file provided');
            }
            
            if (file.buffer) {
                // Memory storage - file has buffer
                console.log('FileManager: Using memory storage, file size:', file.buffer.length);
                await fs.writeFile(filePath, file.buffer);
            } else if (file.path) {
                // Disk storage - file has path to temporary location
                console.log('FileManager: Using disk storage, temp path:', file.path);
                await fs.copyFile(file.path, filePath);
                // Clean up temporary file
                try {
                    await fs.unlink(file.path);
                    console.log('FileManager: Temporary file cleaned up');
                } catch (cleanupError) {
                    console.warn('FileManager: Could not clean up temporary file:', cleanupError.message);
                }
            } else {
                console.error('FileManager: Invalid file data - no buffer or path');
                throw new Error('Invalid file data - no buffer or path');
            }
            
            console.log('FileManager: Translated file written successfully');
            console.log('FileManager: Returning file info:', {
                filePath: fileName,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            });
            
            return {
                filePath: fileName, // Store relative path only
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            };
        } catch (error) {
            console.error('FileManager: Error saving translated file:', error);
            console.error('FileManager: Error stack:', error.stack);
            throw new Error(`Failed to save translated file securely: ${error.message}`);
        }
    }

    // Retrieve uploaded file
    async getUploadedFile(fileName) {
        try {
            const filePath = path.join(UPLOAD_DIR, fileName);
            const content = await fs.readFile(filePath);
            
            // For now, return content directly without decryption
            return content;
        } catch (error) {
            console.error('Error retrieving file:', error);
            throw new Error('File not found or corrupted');
        }
    }

    // Retrieve translated file
    async getTranslatedFile(fileName) {
        try {
            console.log('FileManager: Retrieving translated file:', fileName);
            console.log('FileManager: TRANSLATED_DIR:', TRANSLATED_DIR);
            
            const filePath = path.join(TRANSLATED_DIR, fileName);
            console.log('FileManager: Full file path:', filePath);
            
            // Check if file exists
            try {
                await fs.access(filePath);
                console.log('FileManager: File exists at path');
            } catch (accessError) {
                console.error('FileManager: File does not exist at path:', filePath);
                console.error('FileManager: Access error:', accessError.message);
                
                // List files in directory for debugging
                try {
                    const files = await fs.readdir(TRANSLATED_DIR);
                    console.log('FileManager: Files in translated directory:', files);
                } catch (readdirError) {
                    console.error('FileManager: Could not read directory:', readdirError.message);
                }
                
                throw new Error(`File not found: ${fileName}`);
            }
            
            const content = await fs.readFile(filePath);
            console.log('FileManager: File content retrieved, size:', content.length);
            
            // For now, return content directly without decryption since files are saved unencrypted
            return content;
        } catch (error) {
            console.error('FileManager: Error retrieving translated file:', error);
            console.error('FileManager: Error message:', error.message);
            console.error('FileManager: Error stack:', error.stack);
            throw new Error('Translated file not found or corrupted: ' + error.message);
        }
    }

    // Delete file
    async deleteFile(fileName, isTranslated = false) {
        try {
            const dir = isTranslated ? TRANSLATED_DIR : UPLOAD_DIR;
            const filePath = path.join(dir, fileName);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }

    // Validate file type
    isValidFileType(file) {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel' // .xls
        ];
        return allowedTypes.includes(file.mimetype);
    }

    // Validate file size (max 10MB)
    isValidFileSize(file) {
        const maxSize = 10 * 1024 * 1024; // 10MB
        return file.size <= maxSize;
    }
}

module.exports = new FileManager();