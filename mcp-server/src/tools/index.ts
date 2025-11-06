import { Prisma } from '@prisma/client'
import { config } from '../config.js'
import { logger } from '../logger.js'
import { fetchJson } from '../services/http.js'
import { cacheGet, cacheSet } from '../services/cache.js'
import {
  getTokenStatByMint,
  listWatchlistMints,
} from '../services/repository.js'
import { prisma } from '../db.js'
import { getRuntime } from '../runtime.js'
import type {
  CandlesInput,
  DiscoverUniverseInput,
  ExecTradeInput,
  HoldersSnapshotInput,
  MarketActivityInput,
  PoolStateInput,
  PortfolioInput,
  RecentTradesInput,
  RulesEngineInput,
  TokenStatsInput,
  WatchlistInput,
} from './types.js'

const CANDLE_CACHE_TTL_MS = 5 * 60 * 1000

export async function discoverUniverse(input: DiscoverUniverseInput) {
  const params = new URLSearchParams()
  const filters = input.filters ?? {}
  if (filters.marketCapMinUSD) params.set('marketCapMin', filters.marketCapMinUSD.toString())
  if (filters.marketCapMaxUSD) params.set('marketCapMax', filters.marketCapMaxUSD.toString())
  if (filters.volume24hMinUSD) params.set('volume24hMin', filters.volume24hMinUSD.toString())
  if (filters.volume24hMaxUSD) params.set('volume24hMax', filters.volume24hMaxUSD.toString())
  if (filters.includeNsfw !== undefined) params.set('includeNsfw', String(filters.includeNsfw))
  if (input.limit) params.set('limit', input.limit.toString())

  const url = `${config.pumpFunDiscoveryUrl}?${params.toString()}`
  const data = await fetchJson<any>(url, {}, { ttlMs: 60_000 })
  return {
    asOf: new Date().toISOString(),
    items: Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [],
  }
}

export async function tokenStats(input: TokenStatsInput) {
  const runtime = getRuntime()
  const snapshot = runtime.aggregator.getSnapshot(input.mint)
  if (snapshot) {
    return {
      ...snapshot,
      usdPx: await solToUsd(snapshot.px),
      asOf: new Date(snapshot.updatedAt).toISOString(),
    }
  }

  const stat = await prisma.tokenStat.findUnique({
    where: { mint: input.mint },
  })

  if (!stat) {
    return null
  }

  return {
    mint: input.mint,
    px: Number(stat.px ?? 0),
    priceChange30sPct: Number(stat.priceChange30sPct ?? 0),
    volumeSol1m: Number(stat.volumeSol1m ?? 0),
    uniqueTraders1m: stat.uniqueTraders1m ?? 0,
    buysPerSec: Number(stat.buysPerSec ?? 0),
    buySellImbalance: Number(stat.buySellImbalance ?? 0),
    m1vs5mVelocity: Number(stat.m1vs5mVelocity ?? 0),
    estFillBps010: stat.estFillBps010 ? Number(stat.estFillBps010) : null,
    usdPx: await solToUsd(Number(stat.px ?? 0)),
    asOf: new Date(stat.updatedAt).toISOString(),
  }
}

export async function recentTrades(input: RecentTradesInput) {
  const params = new URLSearchParams()
  if (input.limit) params.set('limit', input.limit.toString())
  if (input.cursor) params.set('cursor', input.cursor)
  if (input.minSol) params.set('minSolAmount', input.minSol.toString())

  const url = `${config.pumpFunSwapApiUrl}/v2/coins/${input.mint}/trades?${params.toString()}`
  const data = await fetchJson<any>(url, {}, { ttlMs: 1_000 })

  const trades = Array.isArray(data?.trades)
    ? data.trades
    : Array.isArray(data)
      ? data
      : []

  return {
    trades: trades.map((trade) => ({
      ts: trade.timestamp,
      side: trade.type,
      amountSol: trade.amountSol ?? trade.solAmount,
      pxSol: trade.priceSol ?? trade.price ?? null,
      user: trade.user ?? trade.userAddress ?? null,
    })),
    stats: data?.stats ?? null,
    nextCursor: data?.nextCursor ?? null,
  }
}

export async function holdersSnapshot(input: HoldersSnapshotInput) {
  const url = `${config.pumpFunAdvancedApiUrl}/${input.mint}`
  const response = await fetchJson<any>(url, {}, { ttlMs: 2 * 60_000 })
  if (!response) {
    return null
  }

  const topHolders = Array.isArray(response?.topHolders) ? response.topHolders : []
  const totalSupply = response?.totalSupply ?? response?.total_supply
  const shareTop10 =
    totalSupply && totalSupply > 0
      ? (topHolders.slice(0, Math.ceil(topHolders.length * 0.1)).reduce((acc, holder) => acc + (holder.amount ?? 0), 0) /
          totalSupply) *
        100
      : null

  const threshold = input.thresholdSol ?? 100
  const richHolders =
    Array.isArray(topHolders)
      ? topHolders.filter((holder) => (holder.solBalance ?? 0) >= threshold).length
      : 0

  return {
    topHolders,
    top10PctShare: shareTop10,
    richHoldersAtThreshold: richHolders,
    asOf: new Date().toISOString(),
  }
}

export async function marketActivity(input: MarketActivityInput) {
  const url = `${config.pumpFunSwapApiUrl}/v1/pools/${input.pool}/market-activity`
  const data = await fetchJson<any>(url, {}, { ttlMs: 30_000 })
  if (!data) return null

  const payload: Record<string, unknown> = {}
  for (const window of input.windows) {
    payload[window] = data[window]
  }

  return {
    ...payload,
    _derived: {
      imbalance1h: data['1h']?.buySellImbalance ?? null,
      buyersPerUser1h:
        data['1h']?.numUsers && data['1h']?.numBuyers
          ? data['1h'].numBuyers / data['1h'].numUsers
          : null,
    },
  }
}

export async function candles(input: CandlesInput) {
  const interval = input.interval ?? '1h'
  const limit = input.limit ?? 200
  const cacheKey = `candles:${input.mint}:${interval}:${limit}`
  const cached = await cacheGet<any>(cacheKey)
  if (cached) return cached

  const url = `${config.pumpFunSwapApiUrl}/v2/coins/${input.mint}/candles?interval=${interval}&limit=${limit}&currency=USD`
  const data = await fetchJson<any>(url, {}, { ttlMs: CANDLE_CACHE_TTL_MS, cacheKey })
  if (!data) return null

  const series = Array.isArray(data?.candles) ? data.candles : Array.isArray(data) ? data : []

  const ema = (period: number) => {
    const multiplier = 2 / (period + 1)
    let emaValue = Number(series[0]?.close ?? 0)
    for (let i = 1; i < series.length; i += 1) {
      const close = Number(series[i]?.close ?? series[i]?.c ?? 0)
      emaValue = (close - emaValue) * multiplier + emaValue
    }
    return emaValue
  }

  const atr = () => {
    if (series.length < 2) return null
    let total = 0
    for (let i = 1; i < series.length; i += 1) {
      const high = Number(series[i].high ?? series[i].h ?? 0)
      const low = Number(series[i].low ?? series[i].l ?? 0)
      total += Math.abs(high - low)
    }
    return total / (series.length - 1)
  }

  const response = {
    ema20: ema(20),
    ema50: ema(50),
    atr14: atr(),
    vwap1h: Number(series.at(-1)?.close ?? series.at(-1)?.c ?? 0),
    last: series.at(-1) ?? null,
  }

  await cacheSet(cacheKey, response, CANDLE_CACHE_TTL_MS)
  return response
}

export async function solPrice() {
  const data = await fetchJson<any>(config.solPriceUrl, {}, { ttlMs: 60_000 })
  const price = Number(data?.solPrice ?? data?.price ?? 0)
  return {
    solUsd: price,
    asOf: new Date().toISOString(),
  }
}

export async function poolState(input: PoolStateInput) {
  if (!config.heliusRpcUrl) {
    throw new Error('HELIUS_RPC_URL is not configured')
  }

  const body = {
    jsonrpc: '2.0',
    id: 'helius-getMultipleAccounts',
    method: 'getMultipleAccounts',
    params: [input.accounts, { encoding: 'base64' }],
  }

  const response = await fetch(config.heliusRpcUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    logger.error({ status: response.status }, 'RPC request failed')
    return null
  }

  return await response.json()
}

export async function watchlist(input: WatchlistInput) {
  if (input.op === 'LIST') {
    const rows = await prisma.agentWatchlist.findMany({
      where: { enabled: true },
    })
    return {
      ok: true,
      watch: rows,
    }
  }

  if (input.op === 'UPSERT' && input.items) {
    for (const item of input.items) {
      await prisma.agentWatchlist.upsert({
        where: { mint: item.mint },
        update: {
          maxEntrySol: item.maxEntrySol ? new Prisma.Decimal(item.maxEntrySol) : undefined,
          minUsers1m: item.minUsers1m,
          maxImpactBps010: item.maxImpactBps,
          enabled: true,
        },
        create: {
          mint: item.mint,
          maxEntrySol: item.maxEntrySol ? new Prisma.Decimal(item.maxEntrySol) : undefined,
          minUsers1m: item.minUsers1m,
          maxImpactBps010: item.maxImpactBps,
          enabled: true,
        },
      })
    }
  }

  if (input.op === 'DELETE' && input.items) {
    for (const item of input.items) {
      await prisma.agentWatchlist.updateMany({
        where: { mint: item.mint },
        data: { enabled: false },
      })
    }
  }

  return watchlist({ op: 'LIST' })
}

export async function portfolio(_input: PortfolioInput) {
  const aiUser = await prisma.user.findFirst({
    where: { isAiAgent: true },
    include: {
      portfolios: {
        include: {
          token: true,
        },
      },
    },
  })

  if (!aiUser) {
    return {
      sol: 0,
      positions: [],
    }
  }

  const solBalance = await prisma.userSession.findUnique({
    where: { userId: aiUser.id },
  })

  const positions = []

  for (const position of aiUser.portfolios) {
    const stat = await getTokenStatByMint(position.token.mintAddress)
    const px = stat?.px ? Number(stat.px) : Number(position.avgBuyPrice)
    const qty = Number(position.amount)

    positions.push({
      mint: position.token.mintAddress,
      qty,
      avgCost: Number(position.avgBuyPrice),
      mktPx: px,
      uPnlPct:
        Number(position.avgBuyPrice) > 0
          ? ((px - Number(position.avgBuyPrice)) / Number(position.avgBuyPrice)) * 100
          : 0,
    })
  }

  return {
    sol: Number(solBalance?.solBalanceStart ?? 0),
    positions,
  }
}

export async function rulesEngine(input: RulesEngineInput) {
  switch (input.op) {
    case 'LIST': {
      const rows = await prisma.agentRule.findMany()
      return { ok: true, rules: rows }
    }
    case 'UPSERT': {
      if (!input.rules) break
      for (const rule of input.rules) {
        await prisma.agentRule.upsert({
          where: { id: rule.id },
          update: {
            expression: rule.expr,
            mint: rule.scope?.mint,
            cooldownSec: rule.cooldownSec,
            enabled: true,
          },
          create: {
            id: rule.id,
            mint: rule.scope?.mint,
            expression: rule.expr,
            cooldownSec: rule.cooldownSec,
            enabled: true,
          },
        })
      }
      return rulesEngine({ op: 'LIST' })
    }
    case 'DELETE': {
      if (!input.rules) break
      for (const rule of input.rules) {
        await prisma.agentRule.deleteMany({
          where: { id: rule.id },
        })
      }
      return rulesEngine({ op: 'LIST' })
    }
    default:
      break
  }

  return { ok: false }
}

export async function execTrade(input: ExecTradeInput) {
  logger.warn({ input }, 'execTrade called but execution service not configured')
  return {
    ok: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      detail: 'Trade execution is not wired to a signer in this build.',
    },
  }
}

async function solToUsd(priceSol: number) {
  if (!Number.isFinite(priceSol) || priceSol <= 0) {
    return null
  }
  const cacheKey = 'sol:usd'
  const cached = await cacheGet<number>(cacheKey)
  if (cached) {
    return priceSol * cached
  }

  const res = await solPrice()
  if (!res) return null
  await cacheSet(cacheKey, res.solUsd, 60_000)
  return priceSol * res.solUsd
}
