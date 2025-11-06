import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { matchOpenOrdersForToken } from '@/lib/orders'

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

const TOKEN_DECIMALS_NUMBER = 1_000_000_000

function toNumber(value: any): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  try {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  } catch (error) {
    return 0
  }
}

function toTimestamp(value: any): number | null {
  if (value === null || value === undefined) return null
  const asNumber = Number(value)
  if (!Number.isFinite(asNumber)) return null
  return asNumber
}

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
      include: {
        price: true,
        tokenStat: {
          select: { px: true },
        },
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const latestSolPrice = await prisma.solPrice.findFirst({
      orderBy: { timestamp: 'desc' },
    })
    const solPriceUsd = latestSolPrice ? Number(latestSolPrice.priceUsd) : 0

    let priceSol = token.price ? Number(token.price.priceSol) : 0
    let priceUsdFromDb = token.price ? Number(token.price.priceUsd) : 0

    let buyVolume = 0
    let sellVolume = 0
    const uniqueTraders = new Set<string>()

    const allTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
    })

    allTrades.forEach((trade) => {
      uniqueTraders.add(trade.userAddress)
      if (trade.type === 1) {
        buyVolume += Number(trade.amountUsd)
      } else {
        sellVolume += Number(trade.amountUsd)
      }
    })

    const recentTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    let totalSupplyTokens = 0
    try {
      totalSupplyTokens = Number(token.totalSupply.toString()) / TOKEN_DECIMALS_NUMBER
    } catch (error) {
      totalSupplyTokens = 0
    }

    if (priceSol > 0) {
      await matchOpenOrdersForToken(token, priceSol)
    }

    const [coinDetails, tradesData, candlesData, topHoldersData] = await Promise.all([
      fetchPumpJson<any>(`https://frontend-api-v3.pump.fun/coins/${params.mintAddress}`),
      fetchPumpJson<any>(`https://swap-api.pump.fun/v2/coins/${params.mintAddress}/trades?limit=100&cursor=0`),
      fetchPumpJson<any>(`https://swap-api.pump.fun/v2/coins/${params.mintAddress}/candles?interval=1m&limit=500&currency=USD&createdTs=${token.createdAt}`),
      fetchPumpJson<any>(`https://advanced-api-v2.pump.fun/coins/top-holders-and-sol-balance/${params.mintAddress}`),
    ])

    let metadataData: any = coinDetails?.metadata || null
    const metadataUri = coinDetails?.metadata_uri || coinDetails?.metadataUri || coinDetails?.metadata?.uri
    const metadataUriString = typeof metadataUri === 'string' ? metadataUri : null
    if (metadataUriString && !metadataData) {
      const normalizedUri = metadataUriString.startsWith('ipfs://')
        ? metadataUriString.replace('ipfs://', 'https://pump.mypinata.cloud/ipfs/')
        : metadataUriString
      metadataData = await fetchPumpJson<any>(normalizedUri, { headers: { accept: 'application/json' } })
    }

    if (!totalSupplyTokens && coinDetails?.total_supply) {
      const supplyRaw = toNumber(coinDetails.total_supply)
      if (supplyRaw > 0) {
        totalSupplyTokens = supplyRaw / TOKEN_DECIMALS_NUMBER
      }
    }

    const remoteTradesRaw = Array.isArray(tradesData?.trades)
      ? tradesData.trades
      : Array.isArray(tradesData)
        ? tradesData
        : []

    const normalizedRemoteTrades = remoteTradesRaw
      .map((trade: any) => {
        const amountSol = toNumber(trade.amountSol ?? trade.solAmount ?? trade.quoteAmount ?? trade.amount_sol)
        const amountUsd = toNumber(trade.amountUsd ?? trade.amount_usd)
        const priceSolValue = toNumber(trade.priceSol ?? trade.price_sol ?? trade.price)
        const priceUsdValue = toNumber(trade.priceUsd ?? trade.price_usd)
        const timestamp = toTimestamp(trade.timestamp ?? trade.time ?? trade.blockTime ?? trade.block_timestamp)

        return {
          type: (trade.type || '').toLowerCase() === 'buy' ? 'buy' : 'sell',
          amountSol: amountSol > 0 ? amountSol : undefined,
          amountUsd: amountUsd > 0 ? amountUsd : undefined,
          priceSol: priceSolValue > 0 ? priceSolValue : undefined,
          priceUsd: priceUsdValue > 0 ? priceUsdValue : undefined,
          timestamp,
          tx: trade.tx || trade.signature || trade.transactionId || trade.id || null,
        }
      })
      .filter((trade: { timestamp: number | null }) => trade.timestamp !== null) as Array<{
        type: 'buy' | 'sell'
        amountSol?: number
        amountUsd?: number
        priceSol?: number
        priceUsd?: number
        timestamp: number
        tx: string | null
      }>

    normalizedRemoteTrades.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))

    if (normalizedRemoteTrades.length > 0) {
      const latestTradeWithPrice = normalizedRemoteTrades.find((trade) => trade.priceSol && trade.priceSol > 0)
      if (latestTradeWithPrice && (!priceSol || priceSol <= 0)) {
        priceSol = latestTradeWithPrice.priceSol!
      }
      if (latestTradeWithPrice && (!priceUsdFromDb || priceUsdFromDb <= 0)) {
        priceUsdFromDb = latestTradeWithPrice.priceUsd || 0
      }
    }

    if ((!priceSol || priceSol <= 0) && coinDetails?.virtual_sol_reserves && coinDetails?.virtual_token_reserves) {
      const virtualSol = toNumber(coinDetails.virtual_sol_reserves) / 1_000_000_000
      const virtualTokens = toNumber(coinDetails.virtual_token_reserves) / 1_000_000_000
      if (virtualSol > 0 && virtualTokens > 0) {
        priceSol = virtualSol / virtualTokens
      }
    }

    if ((!priceUsdFromDb || priceUsdFromDb <= 0) && coinDetails?.usd_market_cap && totalSupplyTokens > 0) {
      const usdMarketCap = toNumber(coinDetails.usd_market_cap)
      if (usdMarketCap > 0) {
        priceUsdFromDb = usdMarketCap / totalSupplyTokens
      }
    }

    if ((!priceUsdFromDb || priceUsdFromDb <= 0) && coinDetails?.market_cap && totalSupplyTokens > 0) {
      const solMarketCap = toNumber(coinDetails.market_cap)
      if (solMarketCap > 0) {
        priceUsdFromDb = solMarketCap * solPriceUsd / totalSupplyTokens
      }
    }

    if (priceSol > 0 && (!priceUsdFromDb || priceUsdFromDb <= 0) && solPriceUsd > 0) {
      priceUsdFromDb = priceSol * solPriceUsd
    }

    const remoteTopHoldersRaw = Array.isArray(topHoldersData?.topHolders)
      ? topHoldersData.topHolders
      : Array.isArray(topHoldersData)
        ? topHoldersData
        : []

    const normalizedTopHolders = remoteTopHoldersRaw.map((holder: any) => {
      const rawAmount = toNumber(holder.amount)
      const amountTokens = rawAmount / TOKEN_DECIMALS_NUMBER
      const share = totalSupplyTokens > 0 ? (amountTokens / totalSupplyTokens) * 100 : undefined
      return {
        address: holder.address,
        amount: rawAmount,
        amountTokens,
        share,
        solBalance: toNumber(holder.solBalance),
      }
    })

    const remoteCandlesRaw = Array.isArray(candlesData)
      ? candlesData
      : Array.isArray(candlesData?.candles)
        ? candlesData.candles
        : []

    const normalizedRemoteCandles = remoteCandlesRaw
      .map((candle: any) => {
        const timestamp = toTimestamp(candle.timestamp ?? candle.time)
        if (!timestamp) return null
        return {
          timestamp,
          open: toNumber(candle.open ?? candle.o),
          high: toNumber(candle.high ?? candle.h),
          low: toNumber(candle.low ?? candle.l),
          close: toNumber(candle.close ?? candle.c),
          volume: toNumber(candle.volume ?? candle.v),
        }
      })
      .filter(Boolean) as Array<{
        timestamp: number
        open: number
        high: number
        low: number
        close: number
        volume: number
      }>

    const poolAddress = coinDetails?.bonding_curve || coinDetails?.bondingCurve || coinDetails?.associated_bonding_curve || null

    const [marketActivityData, creatorData] = await Promise.all([
      poolAddress
        ? fetchPumpJson<any>(`https://swap-api.pump.fun/v2/pools/${poolAddress}/market-activity`)
        : Promise.resolve(null),
      token.creatorAddress
        ? fetchPumpJson<any>(`https://frontend-api-v3.pump.fun/users/${token.creatorAddress}`)
        : Promise.resolve(null),
    ])

    let marketCapUsd = 0
    let marketCapSol = 0
    if (totalSupplyTokens > 0 && priceUsdFromDb > 0) {
      marketCapUsd = priceUsdFromDb * totalSupplyTokens
      marketCapSol = priceSol > 0 ? priceSol * totalSupplyTokens : (solPriceUsd > 0 ? marketCapUsd / solPriceUsd : 0)
    }

    if ((!marketCapUsd || marketCapUsd <= 0) && coinDetails?.usd_market_cap) {
      marketCapUsd = toNumber(coinDetails.usd_market_cap)
      marketCapSol = solPriceUsd > 0 ? marketCapUsd / solPriceUsd : marketCapSol
    }

    if ((!marketCapSol || marketCapSol <= 0) && coinDetails?.market_cap) {
      marketCapSol = toNumber(coinDetails.market_cap)
      marketCapUsd = marketCapUsd > 0 ? marketCapUsd : marketCapSol * solPriceUsd
    }

    const responsePayload = {
      id: token.id,
      mintAddress: token.mintAddress,
      symbol: token.symbol,
      name: token.name,
      imageUri: token.imageUri,
      twitter: token.twitter,
      telegram: token.telegram,
      website: token.website,
      creatorAddress: token.creatorAddress,
      createdAt: Number(token.createdAt),
      kingOfTheHillTimestamp: token.kingOfTheHillTimestamp ? Number(token.kingOfTheHillTimestamp) : null,
      completed: token.completed,
      price: {
        priceSol: priceSol > 0 ? priceSol : 0,
        priceUsd: priceUsdFromDb > 0 ? priceUsdFromDb : 0,
        lastTradeTimestamp: token.price?.lastTradeTimestamp ? Number(token.price.lastTradeTimestamp) : null,
      },
      stats: {
        buyVolume,
        sellVolume,
        totalVolume: buyVolume + sellVolume,
        uniqueTraders: uniqueTraders.size,
        totalTrades: allTrades.length,
      },
      totalSupplyTokens,
      marketCapUsd,
      marketCapSol,
      remote: {
        poolAddress,
        coin: coinDetails,
        metadata: metadataData,
        trades: normalizedRemoteTrades,
        candles: normalizedRemoteCandles,
        topHolders: normalizedTopHolders,
        marketActivity: marketActivityData || undefined,
        creator: creatorData,
      },
      recentTrades: recentTrades.slice(0, 20).map((t) => ({
        type: t.type === 1 ? 'buy' : 'sell',
        amountSol: Number(t.amountSol),
        amountUsd: Number(t.amountUsd),
        timestamp: t.timestamp.toString(),
      })),
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Get token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
