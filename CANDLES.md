# Candle Aggregation System

## Overview

Candles (OHLCV data) are **derived from trades**, not fetched separately. This ensures accuracy and efficiency.

## Memory-Efficient Hybrid Approach

**Problem**: With 10s-100s of thousands of tokens, pre-aggregating all candles would use too much memory.

**Solution**: Hybrid approach:
1. **Pre-aggregate** candles for active tokens only (10+ trades/hour)
2. **Generate on-demand** candles from trades for less active tokens
3. **Time-travel aware**: All candle generation respects simulation time boundaries

This ensures:
- ✅ Memory efficient (only active tokens pre-aggregated)
- ✅ Always accurate (generated from source trades)
- ✅ Time-travel compatible (filters by simulation timestamp)
- ✅ Fast for active tokens (pre-aggregated)
- ✅ Works for all tokens (on-demand generation)

## How It Works

1. **Trades are ingested** via WebSocket in real-time
2. **Candles are aggregated** periodically from trades
3. **Only new trades** since the last candle are processed (incremental)

## Candle Intervals

- **1 minute** (1m) - For detailed charts
- **5 minutes** (5m) - Short-term trading
- **1 hour** (1h) - Default view
- **6 hours** (6h) - Medium-term trends
- **24 hours** (24h) - Long-term analysis

## Aggregation Process

### Pre-Aggregation (Active Tokens Only)

For active tokens (10+ trades/hour) and all intervals:
1. Find the last candle timestamp
2. Get all trades since that timestamp
3. Group trades by candle interval
4. Calculate OHLCV (Open, High, Low, Close, Volume)
5. Upsert candles (create new or update existing)

Runs every 15 minutes via PM2 cron.

### On-Demand Generation (All Tokens)

When a token's candles are requested:
1. Get trades for the token in the requested time range
2. Filter by simulation time if in time-travel mode
3. Group trades by candle interval
4. Calculate OHLCV on-the-fly
5. Return candles (not stored, regenerated each time)

This ensures:
- Memory efficient (no storage for inactive tokens)
- Time-travel aware (respects simulation timestamps)
- Always accurate (generated from source data)

## Running Candle Aggregation

### Manual Run

```bash
npm run aggregate:candles
```

This only pre-aggregates candles for active tokens (10+ trades/hour). Less active tokens generate candles on-demand.

### Automatic (PM2 Cron)

The PM2 ecosystem config includes a cron job that runs every 15 minutes:

```javascript
cron_restart: '*/15 * * * *' // Every 15 minutes (only for active tokens)
```

This is less frequent because:
- Only active tokens are pre-aggregated
- Less active tokens generate candles on-demand anyway
- Reduces database load and memory usage

### System Cron (Alternative)

Add to crontab for more control:

```bash
# Edit crontab
crontab -e

# Add this line (runs every 5 minutes)
*/5 * * * * cd /home/hendo420/autoTrader && npm run aggregate:candles >> /dev/null 2>&1
```

## Efficiency

- **Incremental**: Only processes new trades since last aggregation
- **Batch processing**: Uses transactions for better performance
- **Token filtering**: Only processes tokens that have trades
- **Error handling**: Continues processing even if one token fails

## API Usage

Candles are fetched via:

```
GET /api/tokens/{mintAddress}/candles?interval=1h&limit=100&simulation_time=1234567890
```

Parameters:
- `interval`: 1m, 5m, 1h, 6h, 24h (default: 1h)
- `limit`: Number of candles to return (default: 100)
- `start_time`: Optional start timestamp
- `end_time`: Optional end timestamp
- `simulation_time`: **Required for time-travel** - Only show data up to this timestamp

### Time-Travel Support

When `simulation_time` is provided:
- Only trades up to that timestamp are included
- Candles are generated from those trades only
- Ensures historical accuracy when trading in the past

Example: User is trading as if it's January 15th:
- `simulation_time=1705276800000` (Jan 15 timestamp)
- Only shows candles from trades before Jan 15
- Future trades are invisible (as if they haven't happened yet)

## Data Flow

```
WebSocket Trade Feed
    ↓
Trades Table (real-time)
    ↓
Candle Aggregation (every 5 minutes)
    ↓
Candles Table
    ↓
API Endpoints
    ↓
Charts/UI
```

## Why This Approach?

1. **Accuracy**: Candles match actual trades, not approximations
2. **Efficiency**: No need to poll APIs for each token
3. **Real-time**: Trades are captured instantly
4. **Flexible**: Can regenerate candles with different intervals
5. **Scalable**: Incremental processing handles large datasets

## Monitoring

Check logs:
```bash
# PM2 logs
pm2 logs autotrader-aggregate-candles

# Or view log files
tail -f logs/aggregate-candles-out.log
```

## Troubleshooting

### Candles not updating?

1. Check if trade ingestion is running: `pm2 status autotrader-ingest-trades`
2. Check if candle aggregation is running: `pm2 status autotrader-aggregate-candles`
3. Check logs for errors: `pm2 logs autotrader-aggregate-candles`
4. Run manually to see errors: `npm run aggregate:candles`

### Missing candles for a token?

- Candle aggregation only processes tokens that have trades
- If a token has no trades, it won't have candles
- Historical candles can be regenerated by clearing the candles table and re-running aggregation

