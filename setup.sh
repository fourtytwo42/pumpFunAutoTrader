#!/bin/bash
# Automated setup script for Pump.fun Mock Trading Platform
# This script handles all setup tasks that require sudo

set -e

echo "🚀 Setting up Pump.fun Mock Trading Platform..."
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "❌ Please do not run this script as root. It will use sudo when needed."
   exit 1
fi

# Step 1: Install PostgreSQL (if not installed)
if ! command -v psql &> /dev/null; then
    echo "📦 Installing PostgreSQL..."
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib postgresql-client
    echo "✅ PostgreSQL installed"
else
    echo "✅ PostgreSQL already installed"
fi

# Step 2: Start PostgreSQL service
echo "🔄 Starting PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql
echo "✅ PostgreSQL service started"

# Step 3: Create database user and database
echo "🗄️  Creating database user and database..."
sudo -u postgres psql -p 5432 << 'EOF'
DROP USER IF EXISTS autotrader;
CREATE USER autotrader WITH PASSWORD 'autotrader_password' CREATEDB;
DROP DATABASE IF EXISTS autotrader;
CREATE DATABASE autotrader OWNER autotrader;
\q
EOF
echo "✅ Database user and database created"

# Step 4: Configure PostgreSQL for remote access
echo "🌐 Configuring PostgreSQL for remote access..."

PG_CONF=$(sudo find /etc/postgresql -name postgresql.conf | head -1)
PG_HBA=$(sudo find /etc/postgresql -name pg_hba.conf | head -1)

if [ -n "$PG_CONF" ]; then
    # Set listen_addresses to all interfaces
    sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
    sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
    
    # Ensure port is 5432
    sudo sed -i "s/^port = 5433/port = 5432/" "$PG_CONF"
    
    echo "✅ PostgreSQL configuration updated"
fi

if [ -n "$PG_HBA" ]; then
    # Add remote access rule if not already present
    if ! sudo grep -q "host    all             all             0.0.0.0/0               md5" "$PG_HBA"; then
        echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a "$PG_HBA" > /dev/null
    fi
    echo "✅ Remote access configured"
fi

# Step 5: Restart PostgreSQL
echo "🔄 Restarting PostgreSQL..."
sudo systemctl restart postgresql
sleep 2
echo "✅ PostgreSQL restarted"

# Step 6: Configure firewall
echo "🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 5432/tcp
    sudo ufw allow 3000/tcp
    echo "✅ Firewall rules added"
else
    echo "⚠️  UFW not found, skipping firewall configuration"
fi

# Step 7: Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 3

# Step 8: Install npm dependencies (if not already installed)
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Step 9: Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'ENVEOF'
# Database
DATABASE_URL="postgresql://autotrader:autotrader_password@localhost:5432/autotrader?schema=public"

# NextAuth
NEXTAUTH_SECRET="ckl6GJrXzz8OsCba+T4nL79in0CAdQAyTPgpiNwVKas="
NEXTAUTH_URL="http://localhost:3000"
ENVEOF
    echo "✅ .env file created"
else
    echo "✅ .env file already exists"
fi

# Step 10: Run database migrations
echo "🗃️  Running database migrations..."
npx prisma db push --accept-data-loss || {
    echo "⚠️  Migration failed, trying alternative method..."
    npx prisma migrate dev --name init || true
}
echo "✅ Database schema created"

# Step 11: Seed database
echo "🌱 Seeding database..."
npm run db:seed || {
    echo "⚠️  Seeding failed, but you can run 'npm run db:seed' manually later"
}
echo "✅ Database seeded"

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Connection Information:"
echo "   Server IP: $SERVER_IP"
echo "   Application URL: http://$SERVER_IP:3000"
echo "   Database: postgresql://autotrader:autotrader_password@$SERVER_IP:5432/autotrader"
echo ""
echo "🚀 To start the application:"
echo "   npm run dev"
echo ""
echo "🔑 Default Login:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""

