# Google OAuth Setup Guide

## Overview
This guide will help you set up Google OAuth (Single Sign-On) for your VerbiForge application. Once configured, users will be able to sign in using their Google accounts.

## Prerequisites
- A Google account
- Access to Google Cloud Console
- Your application deployed on Render

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" at the top of the page
3. Click "New Project"
4. Enter a project name (e.g., "VerbiForge OAuth")
5. Click "Create"

## Step 2: Enable Google+ API

1. In your new project, go to "APIs & Services" > "Library"
2. Search for "Google+ API" or "Google Identity"
3. Click on "Google Identity" and then "Enable"

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the OAuth consent screen:
   - User Type: External
   - App name: VerbiForge
   - User support email: Your email
   - Developer contact information: Your email
   - Save and continue through the remaining steps

4. Create OAuth Client ID:
   - Application type: Web application
   - Name: VerbiForge Web Client
   - Authorized JavaScript origins:
     - `https://verbiforge.onrender.com`
     - `http://localhost:3006` (for local development)
   - Authorized redirect URIs:
     - `https://verbiforge.onrender.com/auth/google/callback`
     - `http://localhost:3006/auth/google/callback` (for local development)
   - Click "Create"

5. **Important**: Copy the Client ID and Client Secret - you'll need these for the next step.

## Step 4: Configure Environment Variables

### Option A: Using Render Dashboard
1. Go to your Render dashboard
2. Select your VerbiForge service
3. Go to "Environment" tab
4. Add the following environment variables:
   - `GOOGLE_CLIENT_ID`: Your Google OAuth Client ID
   - `GOOGLE_CLIENT_SECRET`: Your Google OAuth Client Secret
   - `GOOGLE_CALLBACK_URL`: `https://verbiforge.onrender.com/auth/google/callback`

### Option B: Using render.yaml (Recommended)
1. Edit your `render.yaml` file
2. Replace the empty values with your actual credentials:
   ```yaml
   - key: GOOGLE_CLIENT_ID
     value: "your-google-client-id-here"
   - key: GOOGLE_CLIENT_SECRET
     value: "your-google-client-secret-here"
   - key: GOOGLE_CALLBACK_URL
     value: https://verbiforge.onrender.com/auth/google/callback
   ```

## Step 5: Deploy the Changes

1. Commit your changes:
   ```bash
   git add .
   git commit -m "Add Google OAuth configuration"
   git push origin master
   ```

2. Wait for the deployment to complete on Render

## Step 6: Test the Integration

1. Visit your application's login page
2. You should see a "Continue with Google" button
3. Click the button to test the OAuth flow
4. You should be redirected to Google's consent screen
5. After authorization, you should be redirected back to your application

## Troubleshooting

### Google OAuth Button Not Showing
- Check that the environment variables are set correctly
- Verify the `/auth/google/status` endpoint returns `{"configured": true}`
- Check the browser console for any errors

### OAuth Callback Errors
- Verify the redirect URI in Google Cloud Console matches exactly
- Check that the callback URL is accessible
- Review the application logs for detailed error messages

### Database Issues
- Ensure the database migration for `google_id` field has run
- Check that the database is properly persisted

## Security Considerations

1. **Never commit credentials to version control**
   - Use environment variables for all sensitive data
   - Keep your Client Secret secure

2. **Use HTTPS in production**
   - Google OAuth requires HTTPS for production applications
   - Render automatically provides HTTPS

3. **Regular credential rotation**
   - Periodically rotate your OAuth credentials
   - Monitor for any suspicious activity

## Local Development

For local development, you can:

1. Set up local environment variables:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   export GOOGLE_CALLBACK_URL="http://localhost:3006/auth/google/callback"
   ```

2. Add `http://localhost:3006` to your authorized origins in Google Cloud Console

3. Run the application locally:
   ```bash
   npm run dev
   ```

## API Endpoints

The following endpoints are available for Google OAuth:

- `GET /auth/google` - Initiates Google OAuth flow
- `GET /auth/google/callback` - Handles OAuth callback
- `GET /auth/google/status` - Checks OAuth configuration status

## User Experience

Once configured, users will:

1. Click "Continue with Google" on login/signup pages
2. Be redirected to Google's consent screen
3. Grant permission to access their email and profile
4. Be automatically logged in and redirected to the appropriate page
5. Have their account created if it doesn't exist

## Support

If you encounter issues:

1. Check the application logs for error messages
2. Verify all environment variables are set correctly
3. Test the OAuth flow in an incognito browser window
4. Ensure your Google Cloud project has the necessary APIs enabled
