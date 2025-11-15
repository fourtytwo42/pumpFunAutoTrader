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
      name: 'autotrader-trade-retention',
      script: 'npm',
      args: 'run retention:trades',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/trade-retention-error.log',
      out_file: './logs/trade-retention-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
