import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Decimal } from '@prisma/client/runtime/library'

const PUMP_HEADERS = {
  accept: 'application/json, text/plain, */*',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun',
  'user-agent': 'PumpFunMockTrader/1.0 (+https://pump.fun)',
};

async function fetchPumpJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      ...init,
      headers: {
        ...PUMP_HEADERS,
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      console.error(`Pump.fun request failed: ${url} :: ${res.status} ${res.statusText}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (error: any) {
    console.error(`Pump.fun request error: ${url} ::`, error?.message || error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const TOKEN_DECIMALS = new Decimal('1e9')

    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
      include: {
        price: true,
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Get recent trades
    const recentTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    // Get market activity stats
    const allTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
    })

    let buyVolume = 0
    let sellVolume = 0
    const uniqueTraders = new Set<string>()

    allTrades.forEach((trade) => {
      uniqueTraders.add(trade.userAddress)
      if (trade.type === 1) {
        buyVolume += Number(trade.amountUsd)
      } else {
        sellVolume += Number(trade.amountUsd)
      }
    })


let totalSupplyTokens = 0
try {
  totalSupplyTokens = Number(new Decimal(token.totalSupply.toString()).div(TOKEN_DECIMALS))
} catch (error) {
  console.warn('Failed to convert total supply for token detail view')
}

const [coinDetails, tradesData, candlesData, topHoldersData, creatorData] = await Promise.all([
  fetchPumpJson<any>(`https://frontend-api-v3.pump.fun/coins/${params.mintAddress}`),
  fetchPumpJson<any>(`https://swap-api.pump.fun/v2/coins/${params.mintAddress}/trades?limit=100&cursor=0`),
  fetchPumpJson<any>(`https://swap-api.pump.fun/v2/coins/${params.mintAddress}/candles?interval=1m&limit=500&currency=USD`),
  fetchPumpJson<any>(`https://advanced-api-v2.pump.fun/coins/top-holders-and-sol-balance/${params.mintAddress}`),
  token.creatorAddress
    ? fetchPumpJson<any>(`https://frontend-api-v3.pump.fun/users/${token.creatorAddress}`)
    : Promise.resolve(null),
])

let metadataData: any = null
const metadataUri = coinDetails?.metadata_uri || coinDetails?.metadataUri || coinDetails?.metadata?.uri
const metadataUriString = typeof metadataUri === 'string' ? metadataUri : null
if (metadataUriString) {
  const normalizedUri = metadataUriString.startsWith('ipfs://')
    ? metadataUriString.replace('ipfs://', 'https://pump.mypinata.cloud/ipfs/')
    : metadataUriString
  metadataData = await fetchPumpJson<any>(normalizedUri, { headers: { accept: 'application/json' } })
}

let poolAddress =
  (coinDetails as any)?.bonding_curve ||
  (coinDetails as any)?.bondingCurve ||
  (coinDetails as any)?.bonding_curve_address ||
  (coinDetails as any)?.bondingCurveAddress ||
  topHoldersData?.topHolders?.[0]?.address ||
  null

const marketActivityData = poolAddress
  ? await fetchPumpJson<any>(`https://swap-api.pump.fun/v1/pools/${poolAddress}/market-activity`)
  : null


const remoteTrades = Array.isArray((tradesData as any)?.trades)
  ? (tradesData as any).trades
  : Array.isArray(tradesData)
    ? (tradesData as any)
    : []
const remoteCandles = Array.isArray(candlesData)
  ? candlesData
  : Array.isArray((candlesData as any)?.candles)
    ? (candlesData as any).candles
    : []
const remoteTopHolders = Array.isArray((topHoldersData as any)?.topHolders)
  ? (topHoldersData as any).topHolders
  : Array.isArray(topHoldersData)
    ? (topHoldersData as any)
    : []

    return NextResponse.json({
      ...token,
      createdAt: Number(token.createdAt),
      kingOfTheHillTimestamp: token.kingOfTheHillTimestamp ? Number(token.kingOfTheHillTimestamp) : null,
      completed: token.completed,
      price: token.price
        ? {
            priceSol: Number(token.price.priceSol),
            priceUsd: Number(token.price.priceUsd),
            lastTradeTimestamp: token.price.lastTradeTimestamp ? Number(token.price.lastTradeTimestamp) : null,
          }
        : null,
      stats: {
        buyVolume,
        sellVolume,
        totalVolume: buyVolume + sellVolume,
        uniqueTraders: uniqueTraders.size,
        totalTrades: allTrades.length,
      },
      totalSupplyTokens,
      remote: {
        poolAddress,
        coin: coinDetails,
        metadata: metadataData,
        trades: remoteTrades,
        candles: remoteCandles,
        topHolders: remoteTopHolders,
        marketActivity: marketActivityData,
        creator: creatorData,
      },
      recentTrades: recentTrades.slice(0, 20).map((t) => ({
        type: t.type === 1 ? 'buy' : 'sell',
        amountSol: Number(t.amountSol),
        amountUsd: Number(t.amountUsd),
        timestamp: t.timestamp.toString(),
      })),
    })
  } catch (error) {
    console.error('Get token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

