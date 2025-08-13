#!/bin/bash

# VerbiForge Hostinger Deployment Script
# Run this script on your Hostinger VPS after initial setup

echo "🚀 Starting VerbiForge deployment on Hostinger..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root (use sudo)"
    exit 1
fi

# Update system packages
print_status "Updating system packages..."
apt update && apt upgrade -y

# Install required packages
print_status "Installing required packages..."

# Install Node.js
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    apt-get install -y nodejs
else
    print_status "Node.js already installed"
fi

# Install PM2
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
else
    print_status "PM2 already installed"
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
    print_status "Installing Nginx..."
    apt install nginx -y
else
    print_status "Nginx already installed"
fi

# Install Git
if ! command -v git &> /dev/null; then
    print_status "Installing Git..."
    apt install git -y
else
    print_status "Git already installed"
fi

# Create application directory
APP_DIR="/var/www/verbiforge"
print_status "Setting up application directory: $APP_DIR"

if [ -d "$APP_DIR" ]; then
    print_warning "Application directory already exists. Updating..."
    cd "$APP_DIR"
    git pull origin master
else
    print_status "Cloning repository..."
    cd /var/www
    git clone https://github.com/sidharth07/verbiforge.git
    cd verbiforge
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install

# Create data directory
print_status "Creating data directory..."
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/secure-files"

# Set permissions
print_status "Setting file permissions..."
chown -R www-data:www-data "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod -R 777 "$APP_DIR/data"
chmod -R 777 "$APP_DIR/secure-files"

# Create environment file if it doesn't exist
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    print_status "Creating environment file..."
    cat > "$ENV_FILE" << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
FILE_ENCRYPTION_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
DATABASE_PATH=$APP_DIR/data
DATABASE_URL=$APP_DIR/data/verbiforge.db
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.xlsx,.xls
DEFAULT_SUPER_ADMIN_EMAIL=sid@verbiforge.com
DEFAULT_SUPER_ADMIN_NAME=Super Admin
GOOGLE_SSO_ADMIN_EMAIL=sid.bandewar@gmail.com
GOOGLE_SSO_ADMIN_NAME=Sid Bandewar (Google SSO)
EOF
    print_status "Environment file created with secure random keys"
else
    print_warning "Environment file already exists. Please check configuration."
fi

# Start application with PM2
print_status "Starting application with PM2..."
cd "$APP_DIR"
pm2 delete verbiforge 2>/dev/null || true
pm2 start server-secure.js --name "verbiforge"
pm2 save
pm2 startup

# Create Nginx configuration
print_status "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/verbiforge << EOF
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    client_max_body_size 10M;
}
EOF

# Enable Nginx site
print_status "Enabling Nginx site..."
ln -sf /etc/nginx/sites-available/verbiforge /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# Configure firewall
print_status "Configuring firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# Test application
print_status "Testing application..."
sleep 5
if curl -s http://localhost:3000/health > /dev/null; then
    print_status "✅ Application is running successfully!"
else
    print_error "❌ Application failed to start. Check logs with: pm2 logs verbiforge"
fi

# Final instructions
echo ""
print_status "🎉 Deployment completed!"
echo ""
echo "Next steps:"
echo "1. Point your domain to this server's IP address"
echo "2. Update the Nginx configuration with your domain name:"
echo "   nano /etc/nginx/sites-available/verbiforge"
echo "3. Install SSL certificate:"
echo "   apt install certbot python3-certbot-nginx -y"
echo "   certbot --nginx -d your-domain.com"
echo "4. Check application status:"
echo "   pm2 status"
echo "5. View logs:"
echo "   pm2 logs verbiforge"
echo ""
echo "Application URL: http://your-server-ip"
echo "Health check: http://your-server-ip/health"
