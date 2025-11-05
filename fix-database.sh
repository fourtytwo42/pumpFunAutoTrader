#!/bin/bash
# Fix database setup script
# Run with: bash fix-database.sh

echo "🔧 Setting up database user and database..."

# Create database user and database
sudo -u postgres psql -p 5432 << 'EOF'
DROP USER IF EXISTS autotrader;
CREATE USER autotrader WITH PASSWORD 'autotrader_password' CREATEDB;
DROP DATABASE IF EXISTS autotrader;
CREATE DATABASE autotrader OWNER autotrader;
\q
EOF

echo "✅ Database user and database created"

# Test connection
echo "Testing connection..."
PGPASSWORD=autotrader_password psql -h localhost -p 5432 -U autotrader -d autotrader -c "SELECT current_database(), current_user;" || {
    echo "❌ Connection test failed"
    exit 1
}

echo "✅ Connection test passed"

# Run Prisma migrations
echo "Running database migrations..."
npx prisma db push --accept-data-loss || {
    echo "❌ Migration failed"
    exit 1
}

echo "✅ Database schema created"

# Seed database
echo "Seeding database..."
npm run db:seed || {
    echo "❌ Seeding failed"
    exit 1
}

echo ""
echo "✅ Database setup complete!"
echo ""
echo "You can now refresh your browser or the Next.js dev server should work automatically."

