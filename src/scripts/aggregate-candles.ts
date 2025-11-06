import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

// Only pre-aggregate candles for active tokens (reduces memory usage)
// For less active tokens, candles are generated on-demand from trades
const ACTIVE_TRADE_THRESHOLD = 10 // Tokens with 10+ trades in last hour
const INTERVALS = [1, 5, 60, 360, 1440] // 1m, 5m, 1h, 6h, 24h

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
  console.log('🕯️ Starting candle aggregation for active tokens only...')
  const startTime = Date.now()

  // Only process tokens with recent activity (reduces memory usage)
  // This is a performance optimization - inactive tokens can generate candles on-demand
  const oneHourAgo = BigInt(Date.now() - 60 * 60 * 1000)
  
  const activeTokens = await prisma.token.findMany({
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

  // Filter to only tokens with significant activity
  const veryActiveTokens = activeTokens.filter(
    (token) => (token._count?.trades || 0) >= ACTIVE_TRADE_THRESHOLD
  )

  console.log(
    `📊 Processing ${veryActiveTokens.length} active tokens (${activeTokens.length} total with recent trades, threshold: ${ACTIVE_TRADE_THRESHOLD}+ trades/hour)...`
  )

  let totalCandles = 0
  let processedTokens = 0

  for (const token of veryActiveTokens) {
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
    `✅ Candle aggregation completed: ${totalCandles} candles created/updated for ${processedTokens} active tokens in ${duration}s`
  )
  console.log(
    `💡 Note: Less active tokens will generate candles on-demand from trades when requested`
  )
}

async function startAggregation() {
  try {
    await aggregateAllCandles()
  } catch (error: any) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

startAggregation()
