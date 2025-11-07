import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

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

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const interval = searchParams.get('interval') || '1m'
    const limit = parseInt(searchParams.get('limit') || '500')

    console.log('[Candles API] Request for mint:', params.mintAddress, 'interval:', interval, 'limit:', limit)

    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
      select: { createdAt: true },
    })

    if (!token) {
      console.warn('[Candles API] Token not found:', params.mintAddress)
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const createdAtMs = token.createdAt ? Number(token.createdAt) : 0
    const createdTs = createdAtMs > 0 ? createdAtMs : undefined
    const pumpUrl = `https://swap-api.pump.fun/v2/coins/${params.mintAddress}/candles?interval=${interval}&limit=${limit}&currency=USD${createdTs ? `&createdTs=${createdTs}` : ''}`
    
    console.log('[Candles API] Fetching from pump.fun:', pumpUrl)
    const remoteCandles = await fetchPumpJson<any>(pumpUrl)

    const remoteCandleArray = Array.isArray(remoteCandles?.candles)
      ? remoteCandles.candles
      : Array.isArray(remoteCandles)
        ? remoteCandles
        : []

    console.log('[Candles API] Remote candles fetched:', remoteCandleArray.length)

    if (remoteCandleArray.length === 0) {
      return NextResponse.json({ candles: [] })
    }

    const candles = remoteCandleArray.map((candle: any) => {
      const timestamp = candle?.timestamp ?? candle?.time
      const tsNumber = Number(timestamp)
      const needsMillis = tsNumber < 1_000_000_000_000
      const tsMs = needsMillis ? tsNumber * 1000 : tsNumber

      const open = candle?.open ?? candle?.o ?? '0'
      const high = candle?.high ?? candle?.h ?? open
      const low = candle?.low ?? candle?.l ?? open
      const close = candle?.close ?? candle?.c ?? open
      const volume = candle?.volume ?? candle?.v ?? '0'

      return {
        timestamp: Math.floor(tsMs).toString(),
        open: String(open),
        high: String(high),
        low: String(low),
        close: String(close),
        volume: String(volume),
        buyVolume: null,
        sellVolume: null,
      }
    })

    console.log('[Candles API] Returning', candles.length, 'candles')

    return NextResponse.json({ candles })
  } catch (error) {
    console.error('Get candles error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
