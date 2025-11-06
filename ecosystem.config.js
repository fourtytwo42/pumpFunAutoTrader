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
      autorestart: true, // Keep running - polls every 15 minutes
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/aggregate-candles-error.log',
      out_file: './logs/aggregate-candles-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-fetch-sol-price',
      script: 'npm',
      args: 'run fetch:sol-price',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true, // Keep running - polls every 5 minutes
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/fetch-sol-price-error.log',
      out_file: './logs/fetch-sol-price-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
