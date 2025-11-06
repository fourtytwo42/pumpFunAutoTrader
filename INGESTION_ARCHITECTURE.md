# Data Ingestion Architecture

## Overview

This document explains the logical data ingestion architecture for the pump.fun mock trading platform.

## Core Principle

**Trades are the source of truth** - All other data (candles, prices, volumes) is derived from trades.

## Architecture

### 1. Trade Ingestion Service (Primary)

**Service**: `src/scripts/ingest-trades.ts`  
**Status**: Long-running service (via PM2)  
**Method**: WebSocket connection to `wss://frontend-api-v3.pump.fun`

**What it does**:
- Connects to pump.fun WebSocket feed
- Listens for `tradeCreated` events
- Stores all trades in the database with full details
- Automatically creates/updates token metadata when trades are received
- Updates token prices in real-time

**Why this approach**:
- **Single source of truth**: Trades contain all the data we need
- **Real-time**: WebSocket provides instant updates
- **Complete**: Every trade is captured, no gaps
- **Efficient**: No polling needed

### 2. Candle Aggregation Service (Derived)

**Service**: `src/scripts/aggregate-candles.ts`  
**Status**: Periodic batch job (via cron or PM2)  
**Method**: Reads trades from database, aggregates into candles

**What it does**:
- Reads all trades from the database
- Groups trades by time interval (1m, 5m, 1h, 6h, 24h)
- Calculates OHLCV (Open, High, Low, Close, Volume) for each interval
- Stores candles in the database

**Why this approach**:
- **Derived data**: Candles are computed from trades, not fetched separately
- **Efficient**: Run periodically (every 5-15 minutes) instead of constantly
- **Accurate**: Based on actual trade data, not approximations
- **Flexible**: Can regenerate candles with different intervals if needed

### 3. Token Metadata Service (Optional)

**Service**: `src/scripts/ingest-tokens.ts`  
**Status**: Periodic batch job (optional)  
**Method**: Fetches metadata from REST API

**What it does**:
- Fetches token metadata (name, symbol, image, social links) from API
- Updates tokens that are missing metadata
- Useful for backfilling or updating metadata

**Why this approach**:
- **Backup**: Token metadata is already captured from trades
- **Enhancement**: Can fetch additional metadata not in trade events
- **Maintenance**: Periodic updates for tokens that need metadata refresh

## Data Flow

```
WebSocket (pump.fun)
    ↓
Trade Ingestion Service
    ↓
Database (trades table)
    ↓
Candle Aggregation Service (periodic)
    ↓
Database (candles table)
```

## Why Not Separate Ingestion?

### Problem with Separate Ingestion:
1. **Trades require token mint address** - Can't fetch trades without knowing tokens
2. **Candles require token mint address** - Can't fetch candles without knowing tokens
3. **Polling overhead** - Would need to continuously poll each token
4. **Missing data** - Polling might miss trades between requests
5. **Rate limiting** - Too many API calls

### Solution with Single Trade Feed:
1. **WebSocket captures ALL trades** - No tokens need to be known upfront
2. **Real-time** - Instant updates, no polling
3. **Complete** - Every trade is captured
4. **Efficient** - Single connection, no rate limits
5. **Derived data** - Candles and prices computed from trades

## PM2 Configuration

### Production Services:

1. **autotrader-web**: Web server (always running)
2. **autotrader-ingest-trades**: Trade ingestion (always running, WebSocket)
3. **autotrader-aggregate-candles**: Candle aggregation (periodic, via cron)

### Running Services:

```bash
# Start all services
npm run pm2:start:all

# Start only web server
npm run pm2:start

# Start only trade ingestion
npm run pm2:start:ingest

# Run candle aggregation manually
npm run aggregate:candles
```

### Cron Setup (Recommended):

Add to crontab for periodic candle aggregation:

```bash
# Aggregate candles every 5 minutes
*/5 * * * * cd /home/hendo420/autoTrader && npm run aggregate:candles >> /dev/null 2>&1
```

## Database Schema

### Trades Table
- Primary source of truth
- Contains: token, user, type (buy/sell), amounts, prices, timestamps
- Indexed by: tokenId, timestamp, userAddress

### Candles Table
- Derived from trades
- Contains: token, interval, OHLCV data
- Indexed by: tokenId, interval, timestamp

### Tokens Table
- Created automatically from trades
- Contains: mint address, symbol, name, metadata
- Updated when trades are received

### Token Prices Table
- Updated from latest trade for each token
- Contains: current price (SOL/USD), last trade timestamp

## Benefits of This Architecture

1. **Single Source of Truth**: All data comes from trades
2. **Real-time**: WebSocket provides instant updates
3. **Efficient**: No unnecessary API calls
4. **Scalable**: Can handle high trade volumes
5. **Accurate**: Derived data matches actual trades
6. **Flexible**: Can regenerate derived data if needed

## Future Enhancements

- **Historical backfill**: Fetch historical trades from REST API for past dates
- **Price normalization**: Use external price feeds for accurate USD conversion
- **Trade replay**: Replay trades at different speeds for time travel
- **Analytics**: Pre-compute common queries (24h volume, price changes, etc.)

