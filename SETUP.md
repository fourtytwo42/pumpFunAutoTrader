# Manual Setup Instructions

This guide provides step-by-step instructions for manually setting up the Pump.fun Mock Trading Platform.

> **Note:** For automated setup, use the `setup.sh` script instead. See [README.md](./README.md) for the quick start guide.

## Prerequisites

- Node.js 18+ and npm
- sudo access

## Step 1: Install PostgreSQL

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-client
```

## Step 2: Start PostgreSQL Service

```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Enable auto-start on boot
```

## Step 3: Create Database User and Database

**This requires sudo access:**

```bash
sudo -u postgres psql << 'EOF'
CREATE USER autotrader WITH PASSWORD 'autotrader_password' CREATEDB;
CREATE DATABASE autotrader OWNER autotrader;
\q
EOF
```

## Step 4: Configure PostgreSQL for Remote Access

**This requires sudo access:**

### Configure listen_addresses

Find and edit the PostgreSQL configuration file:

```bash
# Find the config file
sudo find /etc/postgresql -name postgresql.conf

# Edit the file (replace with actual path)
sudo nano /etc/postgresql/17/main/postgresql.conf
```

Change:
```
#listen_addresses = 'localhost'
```

To:
```
listen_addresses = '*'
```

Ensure port is set to 5432:
```
port = 5432
```

### Configure pg_hba.conf

```bash
# Find the pg_hba.conf file
sudo find /etc/postgresql -name pg_hba.conf

# Add remote access rule (replace with actual path)
echo "host    all             all             0.0.0.0/0               md5" | sudo tee -a /etc/postgresql/17/main/pg_hba.conf
```

### Restart PostgreSQL

```bash
sudo systemctl restart postgresql
```

## Step 5: Configure Firewall

**This requires sudo access:**

```bash
# Allow PostgreSQL (port 5432)
sudo ufw allow 5432/tcp

# Allow Next.js (port 3000)
sudo ufw allow 3000/tcp

# Check firewall status
sudo ufw status
```

## Step 6: Install Dependencies

**No sudo required:**

```bash
npm install
```

## Step 7: Create Environment File

**No sudo required:**

Create a `.env` file in the project root:

```bash
cat > .env << 'EOF'
# Database
DATABASE_URL="postgresql://autotrader:autotrader_password@localhost:5432/autotrader?schema=public"

# NextAuth
NEXTAUTH_SECRET="ckl6GJrXzz8OsCba+T4nL79in0CAdQAyTPgpiNwVKas="
NEXTAUTH_URL="http://localhost:3000"
EOF
```

## Step 8: Run Database Migrations

**No sudo required:**

```bash
npx prisma db push --accept-data-loss
```

## Step 9: Seed Database

**No sudo required:**

```bash
npm run db:seed
```

## Step 10: Start Development Server

**No sudo required:**

```bash
npm run dev
```

The application will be available at `http://localhost:3000` (local) and `http://<SERVER_IP>:3000` (remote).

## Summary of Sudo Requirements

The following operations require sudo access (all handled by `setup.sh`):

1. ✅ Installing PostgreSQL packages
2. ✅ Starting/enabling PostgreSQL service
3. ✅ Creating database user and database
4. ✅ Editing PostgreSQL configuration files
5. ✅ Configuring firewall rules

All other operations (installing npm packages, running migrations, starting the app) do not require sudo.

## Troubleshooting

### Verify PostgreSQL is Running

```bash
sudo systemctl status postgresql
```

### Test Database Connection

```bash
PGPASSWORD=autotrader_password psql -h localhost -U autotrader -d autotrader -c "SELECT version();"
```

### Check PostgreSQL is Listening

```bash
sudo ss -tlnp | grep 5432
# Should show: 0.0.0.0:5432
```

### View PostgreSQL Logs

```bash
sudo tail -f /var/log/postgresql/postgresql-*-main.log
```
