module.exports = {
  apps: [
    {
      name: 'autotrader-web',
      script: 'npm',
      args: 'run start',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-ingest-trades',
      script: 'npm',
      args: 'run ingest:trades',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true, // Keep running - WebSocket connection
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/ingest-trades-error.log',
      out_file: './logs/ingest-trades-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-aggregate-candles',
      script: 'npm',
      args: 'run aggregate:candles',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: false, // Run once and exit - use cron for periodic runs
      watch: false,
      max_memory_restart: '500M',
      cron_restart: '*/5 * * * *', // Run every 5 minutes via PM2 cron
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/aggregate-candles-error.log',
      out_file: './logs/aggregate-candles-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
