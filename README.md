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
- 📈 **Real-time Data**: WebSocket feed captures all trades in real-time
- 🕯️ **Smart Candles**: Memory-efficient candle system with on-demand generation

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL (installed on the system)
- sudo access (for PostgreSQL setup)

## Quick Start

### 1. Initial Setup

```bash
# Clone the repository (if not already done)
cd autoTrader

# Install PostgreSQL (if not already installed)
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgresql-client

# Install dependencies
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```bash
# Database
DATABASE_URL="postgresql://autotrader:autotrader_password@localhost:5432/autotrader?schema=public"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here"
NEXTAUTH_URL="http://localhost:3000"
```

Generate a secure `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Database Setup

```bash
# First-time setup: Create database and user
npm run db:setup

# Start PostgreSQL service (if not running)
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Enable auto-start on boot

# Wait for database to be ready
npm run db:wait

# Run database migrations
npm run db:migrate:dev

# Seed the database (creates admin account)
npm run db:seed
```

Or use the all-in-one setup command (after initial db:setup):
```bash
npm run setup
```

### 4. Start Development Server

```bash
npm run dev
```

The application will be available at:
- **Local**: `http://localhost:3000`
- **Remote**: `http://192.168.50.180:3000` (or your server's IP address)

The dev server is configured to listen on `0.0.0.0` (all interfaces) for remote access.

## Default Login Credentials

After running `npm run db:seed`, you can log in with:

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
npm run pm2:start:all    # Start all services (web + trade ingestion)
npm run pm2:start:ingest # Start only trade ingestion service
npm run pm2:stop         # Stop all PM2 processes
npm run pm2:restart      # Restart all PM2 processes
npm run pm2:status       # View PM2 process status
npm run pm2:logs         # View PM2 logs
```

See [PM2.md](./PM2.md) for detailed PM2 usage instructions.

### Database Management

```bash
npm run db:setup      # Create database and user (first-time setup)
npm run db:start      # Start PostgreSQL service
npm run db:stop       # Stop PostgreSQL service
npm run db:status     # Check PostgreSQL service status
npm run db:wait       # Wait for database to be ready
npm run db:migrate    # Run production migrations
npm run db:migrate:dev # Run development migrations
npm run db:seed       # Seed database with initial data
npm run db:reset      # Reset database (WARNING: deletes all data and recreates)
npm run db:studio     # Open Prisma Studio (database GUI)
```

### Data Ingestion

```bash
npm run ingest:trades      # Start trade ingestion service (WebSocket, long-running)
npm run aggregate:candles  # Aggregate candles from trades (runs once, then exits)
npm run ingest:tokens      # Update token metadata (optional, tokens auto-created from trades)
```

## Architecture

### Data Ingestion System

**Core Principle**: Trades are the source of truth - all other data is derived from trades.

#### Trade Ingestion (Primary Service)

- **Service**: `npm run ingest:trades`
- **Method**: WebSocket connection to `wss://frontend-api-v3.pump.fun`
- **Status**: Long-running service (via PM2)
- **What it does**:
  - Connects to pump.fun WebSocket feed
  - Listens for `tradeCreated` events in real-time
  - Stores all trades in the database
  - Automatically creates/updates token metadata
  - Updates token prices in real-time

#### Candle Aggregation (Hybrid System)

- **Pre-Aggregation**: Active tokens only (10+ trades/hour)
  - Runs every 15 minutes via PM2 cron
  - Reduces memory usage for high-volume scenarios
- **On-Demand Generation**: All tokens
  - Generated from trades when requested
  - Memory efficient (no storage for inactive tokens)
  - Time-travel aware (respects simulation timestamps)

See [INGESTION_ARCHITECTURE.md](./INGESTION_ARCHITECTURE.md) and [CANDLES.md](./CANDLES.md) for detailed documentation.

### Time Travel System

The platform supports historical trading by allowing users to:
- Set simulation time to any historical timestamp
- View charts and data only up to that time
- Trade as if it's that point in time
- Control playback speed for time progression

When in time-travel mode:
- Charts show only data up to the simulation time
- Future trades are invisible (as if they haven't happened)
- Portfolio and balances reflect the historical state
- All data respects the simulation timestamp

## Admin Panel

Access the admin panel at `/dashboard/admin` (requires admin or power user role).
Features include:
- User management (create, edit, activate/deactivate)
- AI trader management (spawn, monitor, start/stop)
- Adjust user roles and permissions
- View system statistics

## MCP Server

The MCP server allows AI agents to interact with the platform. See `mcp-server/README.md` for setup instructions.

AI agents can:
- View token information and prices
- Get market activity and trades
- Place buy/sell orders
- View their portfolio and P/L
- Control simulation time and playback speed
- Log their thought process

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

### Firewall Configuration for Next.js

The dev server listens on `0.0.0.0:3000` for remote access. Make sure port 3000 is open:

```bash
# UFW (Ubuntu Firewall)
sudo ufw allow 3000/tcp

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
npm run db:migrate:dev
npm run db:seed
```

### Trade Ingestion Not Working

```bash
# Check if service is running
pm2 status autotrader-ingest-trades

# View logs
pm2 logs autotrader-ingest-trades

# Restart service
pm2 restart autotrader-ingest-trades
```

### Candles Not Showing

- Candles are generated on-demand from trades
- Check if trades are being ingested: `pm2 logs autotrader-ingest-trades`
- For active tokens, candles are pre-aggregated every 15 minutes
- For inactive tokens, candles generate automatically when requested
- Ensure simulation time is correct if using time-travel mode

## Tech Stack

- **Frontend**: Next.js 14, React, Material-UI
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Charts**: Recharts
- **Process Management**: PM2
- **Real-time Data**: Socket.IO (WebSocket client)

## Remote Access

Both the Next.js application and PostgreSQL database are configured for remote access.

### Next.js Application

The dev server listens on `0.0.0.0:3000`, making it accessible from other machines on your network.

**Access URLs:**
- Local: `http://localhost:3000`
- Remote: `http://<SERVER_IP>:3000` (e.g., `http://192.168.50.180:3000`)

**Firewall:** Port 3000 should be open (already configured with UFW).

### Remote Database Access

The database is configured to accept remote connections. To connect from another computer:

**Connection String:**
```
postgresql://autotrader:autotrader_password@<SERVER_IP>:5432/autotrader?schema=public
```

Replace `<SERVER_IP>` with your server's IP address.

**Security Considerations:**

⚠️ **WARNING**: The database is exposed to the network. For production use:

1. **Change the default password**:
   ```bash
   sudo -u postgres psql -c "ALTER USER autotrader WITH PASSWORD 'your_strong_password';"
   ```

2. **Use firewall rules** to restrict access:
   ```bash
   # Allow only specific IPs
   sudo ufw allow from <TRUSTED_IP> to any port 5432
   ```

3. **Consider using SSL/TLS** for encrypted connections

4. **Update `.env`** with the new password if changed

**Firewall Configuration:**

If you're using UFW (Ubuntu Firewall):
```bash
# Allow PostgreSQL from anywhere (less secure)
sudo ufw allow 5432/tcp

# Or allow only from specific IP (more secure)
sudo ufw allow from <TRUSTED_IP> to any port 5432
```

**Testing Remote Connection:**

From another computer, test the connection:
```bash
psql -h <SERVER_IP> -U autotrader -d autotrader
# Enter password: autotrader_password
```

## Production Deployment

### Using PM2

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Start all services**:
   ```bash
   npm run pm2:start:all
   ```

3. **Save PM2 configuration**:
   ```bash
   pm2 save
   ```

4. **Set up auto-start on boot** (if not already done):
   ```bash
   pm2 startup
   # Follow the instructions provided
   ```

### Services Running

- **autotrader-web**: Production web server (always running)
- **autotrader-ingest-trades**: Trade ingestion via WebSocket (always running)
- **autotrader-aggregate-candles**: Candle aggregation (every 15 minutes via cron)

### Monitoring

```bash
# View all processes
pm2 status

# View logs
pm2 logs

# View specific service logs
pm2 logs autotrader-ingest-trades

# Monitor in real-time
pm2 monit
```

## Performance & Scalability

### Memory Efficiency

- **Trade ingestion**: Processes trades in batches (100 trades/batch)
- **Candle aggregation**: Only pre-aggregates active tokens (10+ trades/hour)
- **On-demand generation**: Less active tokens generate candles when requested
- **Incremental updates**: Only processes new trades since last aggregation

### Scalability Features

- Handles 10s-100s of thousands of tokens per day
- Efficient batch processing for trades
- Smart pre-aggregation for active tokens only
- On-demand generation for inactive tokens
- Time-travel aware data filtering

## Documentation

- [INGESTION_ARCHITECTURE.md](./INGESTION_ARCHITECTURE.md) - Data ingestion system architecture
- [CANDLES.md](./CANDLES.md) - Candle aggregation system details
- [PM2.md](./PM2.md) - PM2 process management guide
- [SETUP.md](./SETUP.md) - Detailed setup instructions
- [REMOTE_ACCESS.md](./REMOTE_ACCESS.md) - Remote access configuration

## License

Private project - All rights reserved

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting) above
- See [SETUP.md](./SETUP.md) for detailed setup instructions
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check remote access: `sudo netstat -tlnp | grep 5432` or `sudo ss -tlnp | grep 5432`
