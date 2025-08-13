const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbHelpers } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'verbiforge-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';
const SALT_ROUNDS = 12;

class AuthManager {
    // Hash password
    async hashPassword(password) {
        return await bcrypt.hash(password, SALT_ROUNDS);
    }

    // Verify password
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    // Generate JWT token
    generateToken(user, expiresIn = JWT_EXPIRES_IN) {
        return jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn }
        );
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (error) {
            return null;
        }
    }

    // Create user
    async createUser(email, password, name) {
        try {
            const existingUser = await dbHelpers.get(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            if (existingUser) {
                throw new Error('User already exists');
            }

            const hashedPassword = await this.hashPassword(password);
            const userId = require('uuid').v4();

            await dbHelpers.run(
                'INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
                [userId, email, hashedPassword, name]
            );

            return { id: userId, email, name, role: 'user' };
        } catch (error) {
            throw error;
        }
    }

    // Authenticate user
    async authenticateUser(email, password) {
        try {
            const user = await dbHelpers.get(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );

            if (!user) {
                throw new Error('Invalid credentials');
            }

            const isValidPassword = await this.verifyPassword(password, user.password_hash);
            if (!isValidPassword) {
                throw new Error('Invalid credentials');
            }

            return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            };
        } catch (error) {
            throw error;
        }
    }

    // Check if user is admin
    async isAdmin(email) {
        try {
            const adminUser = await dbHelpers.get(
                'SELECT email FROM admin_users WHERE email = ?',
                [email]
            );
            return !!adminUser;
        } catch (error) {
            return false;
        }
    }

    // Check if user is super admin
    async isSuperAdmin(email) {
        try {
            const adminUser = await dbHelpers.get(
                'SELECT is_super_admin FROM admin_users WHERE email = ? AND is_super_admin = TRUE',
                [email]
            );
            return !!adminUser;
        } catch (error) {
            return false;
        }
    }

    // Get user by ID
    async getUserById(id) {
        try {
            const user = await dbHelpers.get(
                'SELECT id, email, name, role FROM users WHERE id = ?',
                [id]
            );
            return user;
        } catch (error) {
            return null;
        }
    }

    // Middleware for authentication
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const user = this.verifyToken(token);
        if (!user) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }

        req.user = user;
        next();
    }

    // Middleware for admin authentication
    async requireAdmin(req, res, next) {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const isAdmin = await this.isAdmin(req.user.email);
        if (!isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.isAdmin = true;
        next();
    }

    // Middleware for super admin authentication
    async requireSuperAdmin(req, res, next) {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const isSuperAdmin = await this.isSuperAdmin(req.user.email);
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin access required' });
        }

        req.isSuperAdmin = true;
        next();
    }
}

module.exports = new AuthManager();