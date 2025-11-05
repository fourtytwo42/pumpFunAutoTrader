#!/bin/bash
# Setup script for remote PostgreSQL access
# Run with: bash setup-remote-access.sh

echo "Setting up PostgreSQL for remote access..."

# Create database user and database
sudo -u postgres psql -p 5432 << 'EOF'
DROP USER IF EXISTS autotrader;
CREATE USER autotrader WITH PASSWORD 'autotrader_password' CREATEDB;
DROP DATABASE IF EXISTS autotrader;
CREATE DATABASE autotrader OWNER autotrader;
\q
EOF

echo "✅ Database user and database created"

# Run Prisma migrations
echo "Running database migrations..."
npx prisma db push --accept-data-loss

echo "Seeding database..."
npm run db:seed

echo ""
echo "✅ PostgreSQL is now configured for remote access!"
echo ""
echo "📋 Connection Details:"
echo "   Server IP: $(hostname -I | awk '{print $1}')"
echo "   Port: 5432"
echo "   Database: autotrader"
echo "   Username: autotrader"
echo "   Password: autotrader_password"
echo ""
echo "🔗 Connection String:"
echo "   postgresql://autotrader:autotrader_password@$(hostname -I | awk '{print $1}'):5432/autotrader?schema=public"
echo ""
echo "🧪 Test from remote machine:"
echo "   psql -h $(hostname -I | awk '{print $1}') -U autotrader -d autotrader"

