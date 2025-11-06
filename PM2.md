# PM2 Process Management

PM2 is configured to manage all application processes including the web server and data ingestion services.

## Installation

PM2 is installed globally. If you need to reinstall:

```bash
sudo npm install -g pm2
```

## PM2 Ecosystem

The `ecosystem.config.js` file defines all processes:

- **autotrader-web**: Production web server (always running)
- **autotrader-ingest-tokens**: Token data ingestion (run on-demand or via cron)
- **autotrader-ingest-trades**: Trade data ingestion (run on-demand or via cron)
- **autotrader-ingest-candles**: Candle/OHLCV data ingestion (run on-demand or via cron)

**Note**: Development mode (`npm run dev`) should be run manually, not via PM2. PM2 is only for production deployments.

**Ingestion Services**: These are configured but not auto-restarted. They run once and exit. Use cron jobs or manual runs for periodic ingestion.

## Quick Start

### Start Production Server

```bash
npm run pm2:start
```

**Note**: For development, run `npm run dev` directly (not via PM2).

### Start All Services (including ingestion)

```bash
npm run pm2:start:all
```

### Start Only Ingestion Services

```bash
npm run pm2:start:ingest
```

### Run Ingestion Manually

To run ingestion services on-demand:

```bash
# Run token ingestion
pm2 start autotrader-ingest-tokens

# Run trade ingestion
pm2 start autotrader-ingest-trades

# Run candle ingestion
pm2 start autotrader-ingest-candles
```

Or use npm scripts directly:
```bash
npm run ingest:tokens
npm run ingest:trades
npm run ingest:candles
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

- **Production**: Use PM2 with `autotrader-web` (runs `npm run start`)
  ```bash
  npm run build
  npm run pm2:start
  ```

- **Development**: Run directly with `npm run dev` (not via PM2)
  ```bash
  npm run dev
  ```

PM2 is only for production deployments. During development, run the dev server directly for better debugging and hot-reloading.

