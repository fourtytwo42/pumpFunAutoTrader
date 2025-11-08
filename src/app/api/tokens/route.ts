import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { matchOpenOrdersForToken } from '@/lib/orders'

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
    console.error(`Pump.fun request error: ${url} ::`, error.message || error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'volume'
    const skip = (page - 1) * limit

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { symbol: { contains: search, mode: 'insensitive' } },
        { mintAddress: { contains: search, mode: 'insensitive' } },
      ]
    }

    const TOKEN_DECIMALS = new Decimal('1e6')

    const timeframeParam = (searchParams.get('timeframe') || '24h').toLowerCase()
    const timeframeToSeconds: Record<string, number | null> = {
      '1m': 60,
      '5m': 5 * 60,
      '15m': 15 * 60,
      '30m': 30 * 60,
      '1h': 60 * 60,
      '6h': 6 * 60 * 60,
      '24h': 24 * 60 * 60,
      '7d': 7 * 24 * 60 * 60,
      '30d': 30 * 24 * 60 * 60,
      all: null,
    }

    const timeframeSeconds = timeframeToSeconds[timeframeParam] ?? timeframeToSeconds['24h']
    const nowMs = BigInt(Date.now())
    const timeframeStartMs = timeframeSeconds ? nowMs - BigInt(timeframeSeconds) * 1000n : undefined
    const tradeWhere = timeframeStartMs ? { timestamp: { gte: timeframeStartMs } } : undefined

    const tokenWhere = {
      ...where,
      ...(timeframeStartMs
        ? {
            trades: {
              some: {
                timestamp: { gte: timeframeStartMs },
              },
            },
          }
        : {}),
    }

    const orderBy: Prisma.TokenOrderByWithRelationInput =
      sortBy === 'price'
        ? { price: { priceSol: 'desc' } }
        : { price: { lastTradeTimestamp: 'desc' } }

    const [tokens, total] = await Promise.all([
      prisma.token.findMany({
        where: tokenWhere,
        include: {
          price: true,
          tokenStat: {
            select: { px: true },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.token.count({ where: tokenWhere }),
    ])

    const [volumeRows, uniqueTraderRows, latestTradeRows, latestSolPrice] = await Promise.all([
      prisma.trade.groupBy({
        by: ['tokenId', 'type'],
        where: tradeWhere,
        _sum: {
          amountSol: true,
          amountUsd: true,
        },
      }),
      prisma.trade.findMany({
        where: tradeWhere,
        distinct: ['tokenId', 'userAddress'],
        select: { tokenId: true },
      }),
      prisma.trade.groupBy({
        by: ['tokenId'],
        where: tradeWhere,
        _max: { timestamp: true },
      }),
      prisma.solPrice.findFirst({
        orderBy: { timestamp: 'desc' },
      }),
    ])

    const solPriceUsd = latestSolPrice ? Number(latestSolPrice.priceUsd) : 160

    const volumeMap = new Map<
      string,
      {
        buyVolumeSol: number
        sellVolumeSol: number
        buyVolumeUsd: number
        sellVolumeUsd: number
      }
    >()

    for (const row of volumeRows) {
      const entry =
        volumeMap.get(row.tokenId) || { buyVolumeSol: 0, sellVolumeSol: 0, buyVolumeUsd: 0, sellVolumeUsd: 0 }
      const sol = row._sum.amountSol ? Number(row._sum.amountSol) : 0
      const summedUsd = row._sum.amountUsd ? Number(row._sum.amountUsd) : 0
      const usd = summedUsd > 0 ? summedUsd : sol * solPriceUsd
      if (row.type === 1) {
        entry.buyVolumeSol += sol
        entry.buyVolumeUsd += usd
      } else {
        entry.sellVolumeSol += sol
        entry.sellVolumeUsd += usd
      }
      volumeMap.set(row.tokenId, entry)
    }

    const uniqueTraderMap = new Map<string, number>()
    for (const row of uniqueTraderRows) {
      uniqueTraderMap.set(row.tokenId, (uniqueTraderMap.get(row.tokenId) ?? 0) + 1)
    }

    const lastTradeMap = new Map<string, number>()
    for (const row of latestTradeRows) {
      if (row._max.timestamp) {
        lastTradeMap.set(row.tokenId, Number(row._max.timestamp))
      }
    }

    function normaliseTimestamp(value?: bigint | number | null): number | null {
      if (value == null) return null
      const numeric = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(numeric)) return null
      if (numeric >= 1e15) {
        return Math.floor(numeric / 1000)
      }
      if (numeric <= 1e11 && numeric > 1e8) {
        return Math.floor(numeric * 1000)
      }
      return Math.floor(numeric)
    }

    // Calculate volume and price changes for each token
    const tokensWithStats = await Promise.all(
      tokens.map(async (token) => {
        const volumes = volumeMap.get(token.id) ?? {
          buyVolumeSol: 0,
          sellVolumeSol: 0,
          buyVolumeUsd: 0,
          sellVolumeUsd: 0,
        }

        const buyVolume = volumes.buyVolumeUsd
        const sellVolume = volumes.sellVolumeUsd
        const totalVolume = buyVolume + sellVolume
        const volumeRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5

        let priceSol = 0
        let priceUsd = 0
        let lastTradeTimestamp: number | null = null

        if (token.price) {
          priceSol = Number(token.price.priceSol)
          const storedPriceUsd = Number(token.price.priceUsd)
          priceUsd = storedPriceUsd > 0 ? storedPriceUsd : priceSol * solPriceUsd
          lastTradeTimestamp = normaliseTimestamp(token.price.lastTradeTimestamp)
        }

        if (!lastTradeTimestamp) {
          const latest = lastTradeMap.get(token.id)
          lastTradeTimestamp = latest ? normaliseTimestamp(latest) : null
        }

        if (priceSol > 0) {
          await matchOpenOrdersForToken(token, priceSol)
        }

        let totalSupplyTokens = 0
        if (token.totalSupply) {
          try {
            const totalSupplyRaw = new Decimal(token.totalSupply.toString())
            if (totalSupplyRaw.gt(0)) {
              totalSupplyTokens = Number(totalSupplyRaw.div(TOKEN_DECIMALS))
            }
          } catch (error) {
            console.warn(`Failed to calculate total supply for token ${token.mintAddress}`)
          }
        }

        let marketCapUsd = 0
        let marketCapSol = 0
        if (totalSupplyTokens > 0) {
          if (priceUsd > 0) {
            marketCapUsd = priceUsd * totalSupplyTokens
          }
          if (priceSol > 0) {
            marketCapSol = priceSol * totalSupplyTokens
            if (marketCapUsd === 0 && solPriceUsd > 0) {
              marketCapUsd = marketCapSol * solPriceUsd
            }
          } else if (marketCapUsd > 0 && solPriceUsd > 0) {
            marketCapSol = marketCapUsd / solPriceUsd
          }
        }

        return {
          id: token.id,
          mintAddress: token.mintAddress,
          symbol: token.symbol,
          name: token.name,
          imageUri: token.imageUri,
          twitter: token.twitter,
          telegram: token.telegram,
          website: token.website,
          createdAt: normaliseTimestamp(token.createdAt),
          kingOfTheHillTimestamp: normaliseTimestamp(token.kingOfTheHillTimestamp),
          completed: token.completed,
          price: token.price
            ? {
                priceSol,
                priceUsd,
                lastTradeTimestamp,
              }
            : null,
          lastTradeTimestamp,
          totalSupplyTokens,
          marketCapUsd,
          marketCapSol,
          buyVolume,
          sellVolume,
          totalVolume,
          volumeRatio,
          uniqueTraders: uniqueTraderMap.get(token.id) ?? 0,
          buyVolumeSol: volumes.buyVolumeSol,
          sellVolumeSol: volumes.sellVolumeSol,
          totalVolumeSol: volumes.buyVolumeSol + volumes.sellVolumeSol,
        }
      })
    )

    // Sort tokens based on sortBy parameter
    let sortedTokens = tokensWithStats
    if (sortBy === 'volume') {
      sortedTokens.sort((a, b) => b.totalVolume - a.totalVolume)
    } else if (sortBy === 'traders') {
      sortedTokens.sort((a, b) => b.uniqueTraders - a.uniqueTraders)
    } else if (sortBy === 'price') {
      sortedTokens.sort((a, b) => {
        const priceA = a.price?.priceSol || 0
        const priceB = b.price?.priceSol || 0
        return priceB - priceA
      })
    }

    return NextResponse.json({
      tokens: sortedTokens,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get tokens error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

