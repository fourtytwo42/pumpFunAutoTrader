import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

// Only pre-aggregate candles for active tokens (reduces memory usage)
// For less active tokens, candles are generated on-demand from trades
// Lower threshold = more tokens pre-aggregated (uses more memory but faster queries)
// Higher threshold = fewer tokens pre-aggregated (uses less memory, slower for inactive tokens)
const ACTIVE_TRADE_THRESHOLD = 10 // Tokens with 10+ trades in last hour
const INTERVALS = [1, 5, 60, 360, 1440] // 1m, 5m, 1h, 6h, 24h
const AGGREGATION_INTERVAL_MS = 15 * 60 * 1000 // Run every 15 minutes

interface CandleData {
  tokenId: string
  interval: number
  timestamp: bigint
  open: Decimal
  high: Decimal
  low: Decimal
  close: Decimal
  volume: Decimal
}

async function aggregateCandlesForToken(tokenId: string, intervalMinutes: number) {
  // Get the last candle timestamp for this token/interval
  const lastCandle = await prisma.candle.findFirst({
    where: {
      tokenId,
      interval: intervalMinutes,
    },
    orderBy: {
      timestamp: 'desc',
    },
  })

  // Get trades since last candle (or all trades if no candle exists)
  const startTimestamp = lastCandle
    ? lastCandle.timestamp + BigInt(intervalMinutes * 60 * 1000)
    : BigInt(0)

  // Get all trades for this token since last candle
  const trades = await prisma.trade.findMany({
    where: {
      tokenId,
      timestamp: {
        gte: startTimestamp,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  })

  if (trades.length === 0) {
    return 0 // No new trades
  }

  // Group trades by candle interval
  const candlesMap = new Map<string, CandleData>()

  for (const trade of trades) {
    // Calculate candle timestamp (round down to interval)
    const tradeTimestamp = Number(trade.timestamp)
    const intervalMs = intervalMinutes * 60 * 1000
    const candleTimestamp = BigInt(Math.floor(tradeTimestamp / intervalMs) * intervalMs)

    const key = `${candleTimestamp}`
    let candle = candlesMap.get(key)

    if (!candle) {
      // Initialize new candle - use first trade's price as open
      candle = {
        tokenId,
        interval: intervalMinutes,
        timestamp: candleTimestamp,
        open: trade.priceSol,
        high: trade.priceSol,
        low: trade.priceSol,
        close: trade.priceSol,
        volume: new Decimal(0),
      }
      candlesMap.set(key, candle)
    }

    // Update candle
    candle.high = Decimal.max(candle.high, trade.priceSol)
    candle.low = Decimal.min(candle.low, trade.priceSol)
    candle.close = trade.priceSol // Last trade price becomes close
    candle.volume = candle.volume.add(trade.amountSol)
  }

  // Insert/update candles in batch
  const candles = Array.from(candlesMap.values())
  
  // Use transaction for better performance
  await prisma.$transaction(
    candles.map((candle) =>
      prisma.candle.upsert({
        where: {
          tokenId_interval_timestamp: {
            tokenId: candle.tokenId,
            interval: candle.interval,
            timestamp: candle.timestamp,
          },
        },
        update: {
          // Update close price and volume (open, high, low stay the same for existing candles)
          close: candle.close,
          high: candle.high,
          low: candle.low,
          volume: candle.volume,
        },
        create: candle,
      })
    )
  )

  return candles.length
}

async function aggregateAllCandles() {
  console.log(`🕯️ [${new Date().toISOString()}] Starting candle aggregation...`)
  const startTime = Date.now()

  // Only process tokens with recent activity (reduces memory usage)
  // This is a performance optimization - inactive tokens can generate candles on-demand
  // For initial setup, we'll process all tokens that have trades (regardless of recency)
  // This ensures candles are created for historical data
  const oneHourAgo = BigInt(Date.now() - 60 * 60 * 1000)
  
  // Get all tokens with trades (for initial aggregation)
  // After initial setup, you can switch to only recent trades
  const allTokensWithTrades = await prisma.token.findMany({
    where: {
      trades: {
        some: {},
      },
    },
    select: { 
      id: true, 
      symbol: true, 
      mintAddress: true,
      _count: {
        select: {
          trades: true, // Total trades
        },
      },
    },
  })

  // Get tokens with recent activity for threshold filtering
  const recentActiveTokens = await prisma.token.findMany({
    where: {
      trades: {
        some: {
          timestamp: {
            gte: oneHourAgo,
          },
        },
      },
    },
    select: { 
      id: true, 
      symbol: true, 
      mintAddress: true,
      _count: {
        select: {
          trades: {
            where: {
              timestamp: {
                gte: oneHourAgo,
              },
            },
          },
        },
      },
    },
  })

  // Create a map of recent active tokens for quick lookup
  const recentActiveMap = new Map(
    recentActiveTokens
      .filter((token) => (token._count?.trades || 0) >= ACTIVE_TRADE_THRESHOLD)
      .map((token) => [token.id, true])
  )

  // Only process tokens that meet the active threshold
  // Less active tokens will generate candles on-demand when requested
  const tokensToProcess = allTokensWithTrades.filter((token) => {
    return recentActiveMap.has(token.id)
  })

  const activeCount = recentActiveTokens.filter(t => (t._count?.trades || 0) >= ACTIVE_TRADE_THRESHOLD).length
  console.log(
    `📊 Processing ${tokensToProcess.length} active tokens (${allTokensWithTrades.length} total with trades, ${activeCount} meet threshold of ${ACTIVE_TRADE_THRESHOLD}+ trades/hour)...`
  )
  if (tokensToProcess.length === 0 && allTokensWithTrades.length > 0) {
    console.log(`💡 No active tokens found. Candles will be generated on-demand when requested.`)
  }

  let totalCandles = 0
  let processedTokens = 0

  for (const token of tokensToProcess) {
    try {
      let tokenCandles = 0
      for (const interval of INTERVALS) {
        const candles = await aggregateCandlesForToken(token.id, interval)
        tokenCandles += candles
      }
      
      if (tokenCandles > 0) {
        processedTokens++
        totalCandles += tokenCandles
      }
    } catch (error: any) {
      console.error(
        `❌ Error aggregating candles for ${token.symbol} (${token.mintAddress}):`,
        error.message
      )
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(
    `✅ [${new Date().toISOString()}] Candle aggregation completed: ${totalCandles} candles created/updated for ${processedTokens} tokens in ${duration}s`
  )
  console.log(
    `💡 Note: Less active tokens will generate candles on-demand from trades when requested`
  )
}

async function startAggregation() {
  // Run immediately on start
  await aggregateAllCandles()

  // Then run periodically
  const interval = setInterval(async () => {
    try {
      await aggregateAllCandles()
    } catch (error: any) {
      console.error('❌ Error in periodic aggregation:', error.message)
    }
  }, AGGREGATION_INTERVAL_MS)

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down candle aggregation service...')
    clearInterval(interval)
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down candle aggregation service...')
    clearInterval(interval)
    await prisma.$disconnect()
    process.exit(0)
  })

  console.log(`⏰ Candle aggregation service running. Will aggregate every ${AGGREGATION_INTERVAL_MS / 1000 / 60} minutes.`)
}

startAggregation().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
