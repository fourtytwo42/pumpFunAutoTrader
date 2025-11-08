import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Decimal } from '@prisma/client/runtime/library'
import { matchOpenOrdersForToken } from '@/lib/orders'
import { ensureTokensMetadata } from '@/lib/pump/metadata-service'

const PUMP_HEADERS = {
  accept: 'application/json, text/plain, */*',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun',
  'user-agent': 'PumpFunMockTrader/1.0 (+https://pump.fun)',
};

const parseNumberParam = (value: string | null): number | undefined => {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseIntParam = (value: string | null): number | undefined => {
  if (value === null || value === '') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    const sortBy = searchParams.get('sortBy') || 'marketCap'
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

    const timeframeParam = (searchParams.get('timeframe') || '10m').toLowerCase()
    const timeframeToSeconds: Record<string, number | null> = {
      '1m': 60,
      '2m': 2 * 60,
      '5m': 5 * 60,
      '10m': 10 * 60,
      '15m': 15 * 60,
      '30m': 30 * 60,
      '60m': 60 * 60,
    }

    const timeframeSeconds = timeframeToSeconds[timeframeParam] ?? timeframeToSeconds['10m']
    const marketCapMin = parseNumberParam(searchParams.get('marketCapMin'))
    const marketCapMax = parseNumberParam(searchParams.get('marketCapMax'))
    const uniqueTradersMin = parseIntParam(searchParams.get('uniqueTradersMin'))
    const uniqueTradersMax = parseIntParam(searchParams.get('uniqueTradersMax'))
    const tradeAmountMin = parseNumberParam(searchParams.get('tradeAmountMin'))
    const tradeAmountMax = parseNumberParam(searchParams.get('tradeAmountMax'))
    const tokenAgeMinHours = parseNumberParam(searchParams.get('tokenAgeMin'))
    const tokenAgeMaxHours = parseNumberParam(searchParams.get('tokenAgeMax'))

    const nowMs = BigInt(Date.now())
    const timeframeStartMs = timeframeSeconds ? nowMs - BigInt(timeframeSeconds) * 1000n : undefined
    const TOKEN_AGE_MAX_HOURS = 168
    const hoursToMs = (hours: number) => BigInt(Math.round(hours * 60 * 60 * 1000))

    let createdAtFilter: { gte?: bigint; lte?: bigint } | undefined
    if (
      (tokenAgeMinHours !== undefined && tokenAgeMinHours > 0) ||
      (tokenAgeMaxHours !== undefined && tokenAgeMaxHours < TOKEN_AGE_MAX_HOURS)
    ) {
      createdAtFilter = {}
      if (tokenAgeMaxHours !== undefined && tokenAgeMaxHours < TOKEN_AGE_MAX_HOURS) {
        const maxAgeDelta = hoursToMs(tokenAgeMaxHours)
        createdAtFilter.gte = nowMs - maxAgeDelta
      }
      if (tokenAgeMinHours !== undefined && tokenAgeMinHours > 0) {
        const minAgeDelta = hoursToMs(tokenAgeMinHours)
        createdAtFilter.lte = nowMs - minAgeDelta
      }
    }

    const amountCondition: { gte?: Decimal; lte?: Decimal } = {}
    if (tradeAmountMin !== undefined) {
      amountCondition.gte = new Decimal(tradeAmountMin)
    }
    if (tradeAmountMax !== undefined) {
      amountCondition.lte = new Decimal(tradeAmountMax)
    }

    const tradeWhereConditions: Record<string, unknown> = {}
    if (timeframeStartMs) {
      tradeWhereConditions.timestamp = { gte: timeframeStartMs }
    }
    if (Object.keys(amountCondition).length > 0) {
      tradeWhereConditions.amountSol = amountCondition
    }

    const tradeWhere = Object.keys(tradeWhereConditions).length > 0 ? tradeWhereConditions : undefined

    const tokenWhere = {
      ...where,
      ...((timeframeStartMs || Object.keys(amountCondition).length > 0)
        ? {
            trades: {
              some: {
                ...(timeframeStartMs ? { timestamp: { gte: timeframeStartMs } } : {}),
                ...(Object.keys(amountCondition).length > 0 ? { amountSol: amountCondition } : {}),
              },
            },
          }
        : {}),
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    }

    const fetchMultiple = Math.max(page + 2, 5)
    const fetchLimit = Math.min(500, limit * fetchMultiple)

    const tokens = await prisma.token.findMany({
      where: tokenWhere,
      include: {
        price: true,
        tokenStat: {
          select: { px: true },
        },
      },
      orderBy: { price: { lastTradeTimestamp: 'desc' } },
      take: fetchLimit,
    })

    if (tokens.length > 0) {
      ensureTokensMetadata(prisma, tokens).catch((error) =>
        console.warn('[tokens-api] metadata refresh failed:', (error as Error).message)
      )
    }

    const tokenIds = tokens.map((token) => token.id)

    const tradeWhereForFetched =
      tokenIds.length > 0
        ? {
            ...(tradeWhere ?? {}),
            tokenId: { in: tokenIds },
          }
        : tradeWhere

    let volumeRows:
      | Array<{
          tokenId: string
          type: number
          _sum: { amountSol: Decimal | null; amountUsd: Decimal | null }
        }>
      | [] = []
    let uniqueTraderRows: Array<{ tokenId: string }> | [] = []
    let latestTradeRows:
      | Array<{
          tokenId: string
          _max: { timestamp: bigint | null }
        }>
      | [] = []
    let latestSolPrice:
      | {
          priceUsd: Decimal
        }
      | null = null

    if (tokenIds.length > 0) {
      const results = await Promise.all([
        prisma.trade.groupBy({
          by: ['tokenId', 'type'],
          where: tradeWhereForFetched,
          _sum: {
            amountSol: true,
            amountUsd: true,
          },
        }),
        prisma.trade.findMany({
          where: tradeWhereForFetched,
          distinct: ['tokenId', 'userAddress'],
          select: { tokenId: true },
        }),
        prisma.trade.groupBy({
          by: ['tokenId'],
          where: tradeWhereForFetched,
          _max: { timestamp: true },
        }),
        prisma.solPrice.findFirst({
          orderBy: { timestamp: 'desc' },
        }),
      ])

      volumeRows = results[0]
      uniqueTraderRows = results[1]
      latestTradeRows = results[2]
      latestSolPrice = results[3]
    }

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

    const nowMsNumber = Date.now()
    const minAgeMs = tokenAgeMinHours !== undefined ? tokenAgeMinHours * 60 * 60 * 1000 : undefined
    const maxAgeMs = tokenAgeMaxHours !== undefined ? tokenAgeMaxHours * 60 * 60 * 1000 : undefined

    let filteredTokens = tokensWithStats.filter((token) => {
      const marketCapValue = token.marketCapUsd ?? 0
      const traderCount = token.uniqueTraders ?? 0
      const createdAtMs = token.createdAt ?? null
      const ageMs = createdAtMs != null ? nowMsNumber - createdAtMs : undefined

      if (marketCapMin !== undefined && marketCapValue < marketCapMin) return false
      if (marketCapMax !== undefined && marketCapValue > marketCapMax) return false
      if (uniqueTradersMin !== undefined && traderCount < uniqueTradersMin) return false
      if (uniqueTradersMax !== undefined && traderCount > uniqueTradersMax) return false
      if (minAgeMs !== undefined) {
        if (ageMs === undefined || ageMs < minAgeMs) {
          return false
        }
      }
      if (maxAgeMs !== undefined) {
        if (ageMs === undefined || ageMs > maxAgeMs) {
          return false
        }
      }
      return true
    })

    // Sort tokens based on sortBy parameter
    switch (sortBy) {
      case 'totalVolume':
        filteredTokens.sort((a, b) => (b.totalVolume ?? 0) - (a.totalVolume ?? 0))
        break
      case 'buyVolume':
        filteredTokens.sort((a, b) => (b.buyVolume ?? 0) - (a.buyVolume ?? 0))
        break
      case 'sellVolume':
        filteredTokens.sort((a, b) => (b.sellVolume ?? 0) - (a.sellVolume ?? 0))
        break
      case 'uniqueTraders':
        filteredTokens.sort((a, b) => (b.uniqueTraders ?? 0) - (a.uniqueTraders ?? 0))
        break
      case 'tokenAge':
        filteredTokens.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        break
      case 'lastTrade':
        filteredTokens.sort((a, b) => (b.lastTradeTimestamp ?? 0) - (a.lastTradeTimestamp ?? 0))
        break
      case 'marketCap':
      default:
        filteredTokens.sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
        break
    }

    const totalFiltered = filteredTokens.length
    const startIndex = (page - 1) * limit
    const paginatedTokens =
      startIndex >= totalFiltered ? [] : filteredTokens.slice(startIndex, startIndex + limit)

    return NextResponse.json({
      tokens: paginatedTokens,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: totalFiltered === 0 ? 0 : Math.ceil(totalFiltered / limit),
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

