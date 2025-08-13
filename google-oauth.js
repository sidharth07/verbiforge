const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { dbHelpers } = require('./database');
const authManager = require('./auth');

// Google OAuth configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'https://verbiforge.onrender.com/auth/google/callback';

// Check if Google OAuth is properly configured
const isGoogleOAuthConfigured = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

console.log('🔐 Google OAuth Configuration Status:');
console.log('  - Client ID configured:', !!GOOGLE_CLIENT_ID);
console.log('  - Client Secret configured:', !!GOOGLE_CLIENT_SECRET);
console.log('  - Callback URL:', GOOGLE_CALLBACK_URL);
console.log('  - OAuth Enabled:', isGoogleOAuthConfigured);

// Only configure Google OAuth strategy if credentials are provided
if (isGoogleOAuthConfigured) {
    // Configure Google OAuth strategy
    passport.use(new GoogleStrategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            console.log('🔐 Google OAuth callback received for:', profile.emails[0].value);
            
            const email = profile.emails[0].value;
            const name = profile.displayName;
            const googleId = profile.id;
            
            // Check if user already exists
            let user = await dbHelpers.get(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
            
            if (user) {
                console.log('✅ Existing user found via Google OAuth:', email);
                // Update user's Google ID if not set
                if (!user.google_id) {
                    await dbHelpers.run(
                        'UPDATE users SET google_id = ? WHERE email = ?',
                        [googleId, email]
                    );
                    user.google_id = googleId;
                }
            } else {
                console.log('👤 Creating new user via Google OAuth:', email);
                // Create new user
                const userId = require('uuid').v4();
                await dbHelpers.run(
                    'INSERT INTO users (id, email, name, google_id, role) VALUES (?, ?, ?, ?, ?)',
                    [userId, email, name, googleId, 'user']
                );
                
                user = {
                    id: userId,
                    email: email,
                    name: name,
                    google_id: googleId,
                    role: 'user'
                };
            }
            
            // Check if user is admin
            const isAdmin = await authManager.isAdmin(email);
            
            return done(null, {
                ...user,
                isAdmin: isAdmin
            });
            
        } catch (error) {
            console.error('❌ Google OAuth error:', error);
            return done(error, null);
        }
    }));
} else {
    console.log('⚠️ Google OAuth not configured - skipping strategy setup');
}

// Serialize user for session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await dbHelpers.get(
            'SELECT id, email, name, role, google_id FROM users WHERE id = ?',
            [id]
        );
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Initialize passport middleware
function initializePassport(app) {
    app.use(passport.initialize());
    app.use(passport.session());
}

// Google OAuth routes
function setupGoogleRoutes(app) {
    // Only set up routes if OAuth is configured
    if (!isGoogleOAuthConfigured) {
        console.log('⚠️ Google OAuth routes not configured - credentials missing');
        return;
    }
    
    // Google OAuth login route
    app.get('/auth/google', passport.authenticate('google', {
        scope: ['profile', 'email']
    }));
    
    // Google OAuth callback route
    app.get('/auth/google/callback', passport.authenticate('google', {
        failureRedirect: '/login.html?error=google_auth_failed',
        session: false
    }), async (req, res) => {
        try {
            const user = req.user;
            
            // Generate JWT token
            const token = authManager.generateToken(user);
            
            // Redirect to frontend with token
            const redirectUrl = user.isAdmin ? '/admin.html' : '/dashboard.html';
            res.redirect(`${redirectUrl}?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`);
            
        } catch (error) {
            console.error('❌ Google OAuth callback error:', error);
            res.redirect('/login.html?error=token_generation_failed');
        }
    });
    
    // Check if Google OAuth is configured
    app.get('/auth/google/status', (req, res) => {
        res.json({
            configured: isGoogleOAuthConfigured,
            callbackUrl: GOOGLE_CALLBACK_URL
        });
    });
}

module.exports = {
    initializePassport,
    setupGoogleRoutes,
    passport,
    isGoogleOAuthConfigured
};
