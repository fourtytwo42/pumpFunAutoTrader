import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Decimal } from '@prisma/client/runtime/library'

const PUMP_HEADERS = {
  accept: 'application/json, text/plain, */*',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun',
  'user-agent': 'PumpFunMockTrader/1.0 (+https://pump.fun)',
}

async function fetchPumpJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers: {
        ...PUMP_HEADERS,
        ...(init.headers || {}),
      },
    })

    if (!res.ok) {
      console.error(`Pump.fun request failed: ${url} :: ${res.status} ${res.statusText}`)
      return null
    }

    return (await res.json()) as T
  } catch (error: any) {
    console.error(`Pump.fun request error: ${url} ::`, error?.message || error)
    return null
  }
}

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

  const trades = await prisma.trade.findMany({
    where,
    orderBy: { timestamp: 'asc' },
  })

  if (trades.length === 0) {
    return []
  }

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
    const tradeTimestamp = Number(trade.timestamp)
    const candleTimestamp = BigInt(Math.floor(tradeTimestamp / intervalMs) * intervalMs)

    const key = candleTimestamp.toString()
    let candle = candlesMap.get(key)

    if (!candle) {
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

    candle.high = Decimal.max(candle.high, trade.priceSol)
    candle.low = Decimal.min(candle.low, trade.priceSol)
    candle.close = trade.priceSol
    candle.volume = candle.volume.add(trade.amountSol)
  }

  const candles = Array.from(candlesMap.values())
    .sort((a, b) => {
      if (a.timestamp < b.timestamp) return -1
      if (a.timestamp > b.timestamp) return 1
      return 0
    })
    .slice(-limit)

  return candles
}

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const interval = searchParams.get('interval') || '1m'
    const limit = parseInt(searchParams.get('limit') || '500')
    const startTime = searchParams.get('start_time')
    const endTime = searchParams.get('end_time')
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

    let startTimestamp: bigint | undefined
    let endTimestamp: bigint | undefined

    if (simulationTime) {
      endTimestamp = BigInt(simulationTime)
    } else if (endTime) {
      endTimestamp = BigInt(endTime)
    }

    if (startTime) {
      startTimestamp = BigInt(startTime)
    }

    const localCandles = await generateCandlesFromTrades(
      token.id,
      intervalMin,
      startTimestamp,
      endTimestamp,
      limit
    )

    const candleMap = new Map<string, {
      timestamp: bigint
      open: Decimal
      high: Decimal
      low: Decimal
      close: Decimal
      volume: Decimal
    }>()

    for (const candle of localCandles) {
      candleMap.set(candle.timestamp.toString(), candle)
    }

    if (candleMap.size < limit) {
      const createdAtMs = token.createdAt ? Number(token.createdAt) : 0
      const createdTs = createdAtMs > 0 ? Math.floor(createdAtMs / 1000) : undefined
      const remoteCandles = await fetchPumpJson<any>(
        `https://swap-api.pump.fun/v2/coins/${params.mintAddress}/candles?interval=${interval}&limit=${limit}&currency=USD${createdTs ? `&createdTs=${createdTs}` : ''}`
      )

      const remoteCandleArray = Array.isArray(remoteCandles?.candles)
        ? remoteCandles.candles
        : Array.isArray(remoteCandles)
          ? remoteCandles
          : []

      if (remoteCandleArray.length > 0) {
        for (const candle of remoteCandleArray) {
          const timestamp = candle?.timestamp ?? candle?.time
          if (timestamp === undefined || timestamp === null) continue
          const tsNumber = Number(timestamp)
          if (!Number.isFinite(tsNumber)) continue
          const needsMillis = tsNumber < 1_000_000_000_000
          const tsBigInt = BigInt(Math.floor(needsMillis ? tsNumber * 1000 : tsNumber))
          const key = tsBigInt.toString()
          if (candleMap.has(key)) continue

          const open = candle?.open ?? candle?.o
          const high = candle?.high ?? candle?.h ?? open
          const low = candle?.low ?? candle?.l ?? open
          const close = candle?.close ?? candle?.c ?? open
          const volume = candle?.volume ?? candle?.v ?? 0

          try {
            candleMap.set(key, {
              timestamp: tsBigInt,
              open: new Decimal(open || 0),
              high: new Decimal(high || open || 0),
              low: new Decimal(low || open || 0),
              close: new Decimal(close || open || 0),
              volume: new Decimal(volume || 0),
            })
          } catch (error) {
            console.warn('Failed to normalize remote candle', error)
          }
        }
      }
    }

    const mergedCandles = Array.from(candleMap.values())
      .sort((a, b) => {
        if (a.timestamp < b.timestamp) return -1
        if (a.timestamp > b.timestamp) return 1
        return 0
      })
      .slice(-limit)

    return NextResponse.json({
      candles: mergedCandles.map((c) => ({
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
