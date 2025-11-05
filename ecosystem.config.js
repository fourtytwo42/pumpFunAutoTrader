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
      name: 'autotrader-dev',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      error_file: './logs/dev-error.log',
      out_file: './logs/dev-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-ingest-tokens',
      script: 'npm',
      args: 'run ingest:tokens',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      restart_delay: 60000, // 1 minute
      watch: false,
      max_memory_restart: '500M',
      cron_restart: '0 */6 * * *', // Every 6 hours
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/ingest-tokens-error.log',
      out_file: './logs/ingest-tokens-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-ingest-trades',
      script: 'npm',
      args: 'run ingest:trades',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      restart_delay: 30000, // 30 seconds
      watch: false,
      max_memory_restart: '500M',
      cron_restart: '*/15 * * * *', // Every 15 minutes
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/ingest-trades-error.log',
      out_file: './logs/ingest-trades-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
    {
      name: 'autotrader-ingest-candles',
      script: 'npm',
      args: 'run ingest:candles',
      cwd: '/home/hendo420/autoTrader',
      instances: 1,
      autorestart: true,
      restart_delay: 60000, // 1 minute
      watch: false,
      max_memory_restart: '500M',
      cron_restart: '*/30 * * * *', // Every 30 minutes
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/ingest-candles-error.log',
      out_file: './logs/ingest-candles-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}

