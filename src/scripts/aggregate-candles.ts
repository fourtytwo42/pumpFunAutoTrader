import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

// Candle intervals in minutes
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
    return // No new trades
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
      // Initialize new candle
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
    candle.close = trade.priceSol
    candle.volume = candle.volume.add(trade.amountSol)
  }

  // Insert/update candles
  const candles = Array.from(candlesMap.values())
  for (const candle of candles) {
    await prisma.candle.upsert({
      where: {
        tokenId_interval_timestamp: {
          tokenId: candle.tokenId,
          interval: candle.interval,
          timestamp: candle.timestamp,
        },
      },
      update: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      },
      create: candle,
    })
  }

  if (candles.length > 0) {
    console.log(
      `✅ Aggregated ${candles.length} candles for token ${tokenId} (${intervalMinutes}m interval)`
    )
  }
}

async function aggregateAllCandles() {
  console.log('🕯️ Starting candle aggregation...')

  // Get all tokens
  const tokens = await prisma.token.findMany({
    select: { id: true, symbol: true },
  })

  console.log(`📊 Processing ${tokens.length} tokens...`)

  for (const token of tokens) {
    for (const interval of INTERVALS) {
      try {
        await aggregateCandlesForToken(token.id, interval)
      } catch (error: any) {
        console.error(
          `❌ Error aggregating candles for ${token.symbol} (${interval}m):`,
          error.message
        )
      }
    }
  }

  console.log('✅ Candle aggregation completed')
}

async function startAggregation() {
  // Run once
  await aggregateAllCandles()
  await prisma.$disconnect()
}

startAggregation().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

