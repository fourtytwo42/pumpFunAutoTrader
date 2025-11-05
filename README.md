# Pump.fun Mock Trading Platform

A mock trading platform inspired by pump.fun with historical trading capabilities, full analytics, and AI trader support.

## Features

- 🎯 **Mock Trading**: Trade any token virtually with mocked SOL
- ⏰ **Time Travel**: Jump to any historical timestamp and trade at different timeframes
- 📊 **Full Analytics**: Charts, volumes, trades, and market activity
- 🤖 **AI Traders**: Spawn and monitor AI trading agents via MCP
- 💧 **Faucet**: Request SOL for testing strategies
- 👥 **Admin Panel**: User management and AI trader monitoring
- 🔐 **Authentication**: Username/password based auth system

## Prerequisites

- Node.js 18+ and npm
- sudo access (required for PostgreSQL installation and setup)

## Quick Start

### Automated Setup (Recommended)

Run the automated setup script. **This requires sudo access** and will:
- Install PostgreSQL (if not already installed)
- Create database user and database
- Configure PostgreSQL for remote access
- Set up firewall rules
- Install dependencies
- Run database migrations
- Seed initial data

```bash
bash setup.sh
```

The script will prompt for your sudo password when needed.

### Manual Setup

If you prefer to set up manually, see [SETUP.md](./SETUP.md) for detailed instructions.

## Starting the Application

After running the setup script:

```bash
npm run dev
```

The application will be available at:
- **Local**: `http://localhost:3000`
- **Remote**: `http://<SERVER_IP>:3000` (accessible from other machines on your network)

The dev server is configured to listen on `0.0.0.0` (all interfaces) for remote access.

## Default Login Credentials

After running the setup script, you can log in with:

- **Admin Account:**
  - Username: `admin`
  - Password: `admin123`

- **Power User Account:**
  - Username: `poweruser`
  - Password: `power123`

- **Test User Account:**
  - Username: `testuser`
  - Password: `test123`

## Available Scripts

### Development

```bash
npm run dev           # Start development server (listens on 0.0.0.0:3000)
npm run build         # Build for production
npm run start         # Start production server (listens on 0.0.0.0:3000)
npm run lint          # Run ESLint
```

### PM2 Process Management

```bash
npm run pm2:start        # Start production server with PM2
npm run pm2:start:dev    # Start development server with PM2
npm run pm2:start:all    # Start all services (web + ingestion)
npm run pm2:stop         # Stop all PM2 processes
npm run pm2:restart      # Restart all PM2 processes
npm run pm2:status       # View PM2 process status
npm run pm2:logs         # View PM2 logs
```

See [PM2.md](./PM2.md) for detailed PM2 usage instructions.

### Database Management

```bash
npm run db:wait       # Wait for database to be ready
npm run db:migrate    # Run production migrations
npm run db:migrate:dev # Run development migrations
npm run db:seed       # Seed database with initial data
npm run db:reset      # Reset database (WARNING: deletes all data and recreates)
npm run db:studio     # Open Prisma Studio (database GUI)
```

### Data Ingestion

```bash
npm run ingest:tokens # Ingest token data from pump.fun APIs
npm run ingest:trades # Ingest trade data from pump.fun APIs
npm run ingest:candles # Ingest candle/OHLCV data from pump.fun APIs
```

## Project Structure

```
autoTrader/
├── prisma/              # Database schema and migrations
├── src/
│   ├── app/             # Next.js app router pages
│   ├── components/      # React components
│   ├── lib/             # Utilities and helpers
│   └── scripts/         # Data ingestion scripts
├── mcp-server/          # MCP server for AI traders
├── scripts/             # Utility scripts
├── setup.sh             # Automated setup script (requires sudo)
├── SETUP.md             # Detailed manual setup instructions
└── docker-compose.yml   # (Optional) PostgreSQL Docker configuration
```

## Key Features Explained

### Time Travel System

The platform allows you to:
- Jump to any historical timestamp
- Trade at different timeframes
- Control playback speed (0.1x to 10x)
- Reset portfolio when changing time periods

### Mock Trading

- Start with 10 SOL (configurable)
- Request more SOL via the faucet
- Buy and sell tokens using current or historical prices
- Track portfolio P/L in real-time

### AI Traders

- Spawn multiple AI trading agents
- Monitor their trades, holdings, and P/L
- View thought process logs
- Control via MCP server

### Admin Panel

- Create and manage user accounts
- Monitor AI traders
- Adjust user roles and permissions
- View system statistics

## Remote Access

Both the Next.js application and PostgreSQL database are configured for remote access.

### Next.js Application

The dev server listens on `0.0.0.0:3000`, making it accessible from other machines on your network.

**Access URLs:**
- Local: `http://localhost:3000`
- Remote: `http://<SERVER_IP>:3000` (e.g., `http://192.168.50.180:3000`)

**Firewall:** Port 3000 is automatically opened during setup.

### Remote Database Access

The database is configured to accept remote connections on port 5432.

**Connection String:**
```
postgresql://autotrader:autotrader_password@<SERVER_IP>:5432/autotrader?schema=public
```

**Firewall:** Port 5432 is automatically opened during setup.

For detailed remote access configuration and security recommendations, see [REMOTE_ACCESS.md](./REMOTE_ACCESS.md).

## Troubleshooting

### Database Connection Issues

If you get `DATABASE_URL` errors:
1. Ensure `.env` file exists with correct `DATABASE_URL`
2. Check that PostgreSQL service is running: `sudo systemctl status postgresql`
3. Start PostgreSQL if needed: `sudo systemctl start postgresql`
4. Verify database is ready: `npm run db:wait`
5. Check database user exists: `sudo -u postgres psql -c "\du"`

### PostgreSQL Not Running

```bash
# Start PostgreSQL service
sudo systemctl start postgresql

# Enable auto-start on boot
sudo systemctl enable postgresql

# Check status
sudo systemctl status postgresql
```

### Port Already in Use

If port 3000 or 5432 is already in use:
- Change port in `.env` (NEXTAUTH_URL) and `next.config.js`
- Change PostgreSQL port in PostgreSQL configuration
- Or stop the conflicting service

### Firewall Configuration

The setup script automatically configures firewall rules. If you need to manually configure:

```bash
# UFW (Ubuntu Firewall)
sudo ufw allow 5432/tcp  # PostgreSQL
sudo ufw allow 3000/tcp  # Next.js

# Check firewall status
sudo ufw status
```

### Database Migration Errors

```bash
# Reset database and start fresh
npm run db:reset

# Or manually recreate
sudo -u postgres psql -c "DROP DATABASE IF EXISTS autotrader;"
sudo -u postgres psql -c "CREATE DATABASE autotrader OWNER autotrader;"
npx prisma db push --accept-data-loss
npm run db:seed
```

## Sudo Requirements

The setup script requires sudo access for the following operations:

1. **Installing PostgreSQL** - System package installation
2. **Creating database user** - PostgreSQL administrative operation
3. **Configuring PostgreSQL** - Editing system configuration files
4. **Firewall configuration** - System security settings

These are one-time setup operations. After setup, the application runs without sudo privileges.

## MCP Server

The MCP server allows AI agents to interact with the platform. See `mcp-server/README.md` for setup instructions.

## Tech Stack

- **Frontend**: Next.js 14, React, Material-UI
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Charts**: Recharts

## License

Private project - All rights reserved

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting) above
- See [SETUP.md](./SETUP.md) for detailed manual setup instructions
- See [REMOTE_ACCESS.md](./REMOTE_ACCESS.md) for remote access configuration
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
