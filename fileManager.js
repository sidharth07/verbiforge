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
            
            // Encrypt file content
            console.log('FileManager: Starting encryption');
            const encryptedContent = this.encryptFile(file.buffer);
            console.log('FileManager: Encryption completed, encrypted size:', encryptedContent.length);
            
            // Save encrypted file
            console.log('FileManager: Writing file to disk');
            await fs.writeFile(filePath, encryptedContent);
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
            const fileName = `translated_${projectId}_${Date.now()}_${file.originalname}`;
            const filePath = path.join(TRANSLATED_DIR, fileName);
            
            // Encrypt file content
            const encryptedContent = this.encryptFile(file.buffer);
            
            // Save encrypted file
            await fs.writeFile(filePath, encryptedContent);
            
            return {
                filePath: fileName, // Store relative path only
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size
            };
        } catch (error) {
            console.error('Error saving translated file:', error);
            throw new Error('Failed to save translated file securely');
        }
    }

    // Retrieve uploaded file
    async getUploadedFile(fileName) {
        try {
            const filePath = path.join(UPLOAD_DIR, fileName);
            const encryptedContent = await fs.readFile(filePath);
            const decryptedContent = this.decryptFile(encryptedContent);
            
            return decryptedContent;
        } catch (error) {
            console.error('Error retrieving file:', error);
            throw new Error('File not found or corrupted');
        }
    }

    // Retrieve translated file
    async getTranslatedFile(fileName) {
        try {
            const filePath = path.join(TRANSLATED_DIR, fileName);
            const encryptedContent = await fs.readFile(filePath);
            const decryptedContent = this.decryptFile(encryptedContent);
            
            return decryptedContent;
        } catch (error) {
            console.error('Error retrieving translated file:', error);
            throw new Error('Translated file not found or corrupted');
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