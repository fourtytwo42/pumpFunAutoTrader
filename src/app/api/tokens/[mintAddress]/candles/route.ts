import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Decimal } from '@prisma/client/runtime/library'

// Generate candles on-demand from trades (memory efficient, always accurate)
async function generateCandlesFromTrades(
  tokenId: string,
  intervalMinutes: number,
  startTime?: bigint,
  endTime?: bigint,
  limit: number = 100
) {
  const where: any = {
    tokenId,
  }

  if (startTime) {
    where.timestamp = { ...where.timestamp, gte: startTime }
  }
  if (endTime) {
    where.timestamp = { ...where.timestamp, lte: endTime }
  }

  // Get trades in time range
  const trades = await prisma.trade.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  })

  if (trades.length === 0) {
    return []
  }

  // Group trades by candle interval
  const candlesMap = new Map<string, {
    timestamp: bigint
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
  }>()

  const intervalMs = intervalMinutes * 60 * 1000

  for (const trade of trades) {
    // Calculate candle timestamp (round down to interval)
    const tradeTimestamp = Number(trade.timestamp)
    const candleTimestamp = BigInt(Math.floor(tradeTimestamp / intervalMs) * intervalMs)

    const key = candleTimestamp.toString()
    let candle = candlesMap.get(key)

    if (!candle) {
      // Initialize new candle
      candle = {
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

  // Convert to array and sort by timestamp
  const candles = Array.from(candlesMap.values())
    .sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1
      if (a.timestamp > b.timestamp) return 1
      return 0
    })
    .slice(-limit) // Get last N candles

  return candles
}

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const interval = searchParams.get('interval') || '1h'
    const limit = parseInt(searchParams.get('limit') || '100')
    const startTime = searchParams.get('start_time')
    const endTime = searchParams.get('end_time')
    
    // For time-travel simulation: get current simulation time
    // If user is viewing historical data, we need to filter by that timestamp
    const simulationTime = searchParams.get('simulation_time')

    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const intervalMinutes: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '1h': 60,
      '6h': 360,
      '24h': 1440,
    }

    const intervalMin = intervalMinutes[interval] || 60

    // Determine time range
    let startTimestamp: bigint | undefined
    let endTimestamp: bigint | undefined

    if (simulationTime) {
      // Time-travel mode: only show data up to simulation time
      endTimestamp = BigInt(simulationTime)
    } else if (endTime) {
      endTimestamp = BigInt(endTime)
    }

    if (startTime) {
      startTimestamp = BigInt(startTime)
    }

    // Generate candles on-demand from trades (memory efficient, always accurate)
    // This ensures we always have correct data for time-travel scenarios
    const candles = await generateCandlesFromTrades(
      token.id,
      intervalMin,
      startTimestamp,
      endTimestamp,
      limit
    )

    return NextResponse.json({
      candles: candles.map((c) => ({
        timestamp: c.timestamp.toString(),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      })),
    })
  } catch (error) {
    console.error('Get candles error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
