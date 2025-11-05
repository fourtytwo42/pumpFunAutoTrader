# PM2 Process Management

PM2 is configured to manage all application processes including the web server and data ingestion services.

## Installation

PM2 is installed globally. If you need to reinstall:

```bash
sudo npm install -g pm2
```

## PM2 Ecosystem

The `ecosystem.config.js` file defines all processes:

- **autotrader-web**: Production web server
- **autotrader-dev**: Development web server
- **autotrader-ingest-tokens**: Token data ingestion (runs every 6 hours)
- **autotrader-ingest-trades**: Trade data ingestion (runs every 15 minutes)
- **autotrader-ingest-candles**: Candle/OHLCV data ingestion (runs every 30 minutes)

## Quick Start

### Start Production Server

```bash
npm run pm2:start
```

### Start Development Server

```bash
npm run pm2:start:dev
```

### Start All Services (including ingestion)

```bash
npm run pm2:start:all
```

### View Status

```bash
npm run pm2:status
# or
pm2 status
```

### View Logs

```bash
npm run pm2:logs
# or
pm2 logs
```

### Stop Services

```bash
npm run pm2:stop
```

### Restart Services

```bash
npm run pm2:restart
```

### Delete All Services

```bash
npm run pm2:delete
```

## PM2 Commands

```bash
pm2 status                    # View all processes
pm2 logs                      # View logs for all processes
pm2 logs <app-name>          # View logs for specific app
pm2 restart <app-name>       # Restart specific app
pm2 stop <app-name>          # Stop specific app
pm2 delete <app-name>        # Delete specific app
pm2 monit                    # Monitor processes in real-time
pm2 save                     # Save current process list
pm2 resurrect                # Restore saved process list
```

## Auto-Start on Boot

PM2 is configured to start automatically on system boot. To set it up:

```bash
pm2 startup
pm2 save
```

This has already been configured during setup.

## Logs

Logs are stored in the `logs/` directory:
- `logs/web-out.log` - Web server stdout
- `logs/web-error.log` - Web server stderr
- `logs/ingest-*-out.log` - Ingestion service stdout
- `logs/ingest-*-error.log` - Ingestion service stderr

## Monitoring

View real-time monitoring:

```bash
pm2 monit
```

## Production vs Development

- **Production**: Use `autotrader-web` (runs `npm run start`)
- **Development**: Use `autotrader-dev` (runs `npm run dev`)

Only run one at a time. For production, use:

```bash
npm run build
npm run pm2:start
```

For development:

```bash
npm run pm2:start:dev
```

