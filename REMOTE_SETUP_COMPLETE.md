# Remote Access Setup Complete! ✅

## Current Status

✅ **PostgreSQL is configured for remote access:**
- Listening on `0.0.0.0:5432` (all interfaces)
- Remote connections enabled in `pg_hba.conf`
- Firewall rule added (port 5432)
- Port configured to 5432

## Server Information

- **Server IP**: `192.168.50.180`
- **Port**: `5432`
- **Database**: `autotrader`
- **Username**: `autotrader`
- **Password**: `autotrader_password`

## Connection String

```
postgresql://autotrader:autotrader_password@192.168.50.180:5432/autotrader?schema=public
```

## Final Setup Steps

Run this command to create the database user and initialize the database:

```bash
bash setup-remote-access.sh
```

Or manually:

```bash
# Create user and database
sudo -u postgres psql -p 5432 << 'EOF'
DROP USER IF EXISTS autotrader;
CREATE USER autotrader WITH PASSWORD 'autotrader_password' CREATEDB;
DROP DATABASE IF EXISTS autotrader;
CREATE DATABASE autotrader OWNER autotrader;
\q
EOF

# Run migrations
npx prisma db push --accept-data-loss

# Seed database
npm run db:seed
```

## Testing Remote Connection

From another computer:

```bash
psql -h 192.168.50.180 -U autotrader -d autotrader
# Enter password: autotrader_password
```

Or using connection string:

```bash
psql "postgresql://autotrader:autotrader_password@192.168.50.180:5432/autotrader"
```

## Security Notes

⚠️ **Important**: The database is now exposed to the network. For production:

1. Change the default password:
   ```bash
   sudo -u postgres psql -c "ALTER USER autotrader WITH PASSWORD 'your_strong_password';"
   ```

2. Restrict access to specific IPs in `/etc/postgresql/17/main/pg_hba.conf`

3. Consider enabling SSL/TLS

4. Update `.env` file if you change the password

## Verify Configuration

Check PostgreSQL is listening:
```bash
sudo ss -tlnp | grep 5432
# Should show: 0.0.0.0:5432
```

Check remote access is enabled:
```bash
sudo grep "0.0.0.0/0" /etc/postgresql/17/main/pg_hba.conf
```

Check firewall:
```bash
sudo ufw status | grep 5432
```

