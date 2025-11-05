# Remote Database Access Configuration

## Current Setup

PostgreSQL has been configured to accept remote connections on port 5432.

## Server IP Address

To find your server's IP address:
```bash
hostname -I
```

## Connection Information

- **Host**: Your server's IP address
- **Port**: 5432
- **Database**: autotrader
- **Username**: autotrader
- **Password**: autotrader_password

## Connection String

```
postgresql://autotrader:autotrader_password@<SERVER_IP>:5432/autotrader?schema=public
```

## Testing Remote Connection

From another computer:
```bash
psql -h <SERVER_IP> -U autotrader -d autotrader
```

Or using a connection string:
```bash
psql "postgresql://autotrader:autotrader_password@<SERVER_IP>:5432/autotrader"
```

## Security Recommendations

### 1. Change Default Password

```bash
sudo -u postgres psql << EOF
ALTER USER autotrader WITH PASSWORD 'your_strong_password_here';
\q
EOF
```

Then update `.env` file:
```bash
DATABASE_URL="postgresql://autotrader:your_strong_password_here@localhost:5432/autotrader?schema=public"
```

### 2. Restrict Access with Firewall

**UFW (Ubuntu Firewall):**
```bash
# Allow only from specific IP
sudo ufw allow from <TRUSTED_IP> to any port 5432

# Or allow from specific subnet
sudo ufw allow from 192.168.1.0/24 to any port 5432
```

**iptables:**
```bash
# Allow only from specific IP
sudo iptables -A INPUT -p tcp -s <TRUSTED_IP> --dport 5432 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 5432 -j DROP
```

### 3. Configure PostgreSQL to Allow Specific IPs Only

Edit `/etc/postgresql/*/main/pg_hba.conf`:
```bash
# Instead of allowing all (0.0.0.0/0), specify trusted IPs:
host    all             all             <TRUSTED_IP>/32    md5
```

Then restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### 4. Enable SSL/TLS (Recommended for Production)

Edit `/etc/postgresql/*/main/postgresql.conf`:
```
ssl = on
ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'
ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'
```

Then use SSL in connection string:
```
postgresql://autotrader:password@server:5432/autotrader?sslmode=require
```

## Troubleshooting

### Check if PostgreSQL is listening on all interfaces:
```bash
sudo netstat -tlnp | grep 5432
# Should show: 0.0.0.0:5432 or :::5432
```

### Check firewall status:
```bash
sudo ufw status
# or
sudo iptables -L -n | grep 5432
```

### Check PostgreSQL logs:
```bash
sudo tail -f /var/log/postgresql/postgresql-*-main.log
```

### Test connection from server itself:
```bash
PGPASSWORD=autotrader_password psql -h localhost -U autotrader -d autotrader -c "SELECT 1;"
```

### Test connection from remote machine:
```bash
psql -h <SERVER_IP> -U autotrader -d autotrader -c "SELECT 1;"
```

## Current Configuration

- ✅ PostgreSQL listening on all interfaces (0.0.0.0:5432)
- ✅ Remote connections allowed in pg_hba.conf
- ⚠️ Firewall may need configuration (check with `sudo ufw status`)
- ⚠️ Default password in use (change for production)

