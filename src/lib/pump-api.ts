/**
 * Centralized Pump.fun API Client
 * All external API calls to pump.fun services
 */

const PUMP_HEADERS = {
  accept: 'application/json, text/plain, */*',
  origin: 'https://pump.fun',
  referer: 'https://pump.fun',
  'user-agent': 'PumpFunMockTrader/1.0 (+https://pump.fun)',
}

const API_ENDPOINTS = {
  frontend: 'https://frontend-api-v3.pump.fun',
  swap: 'https://swap-api.pump.fun',
  advanced: 'https://advanced-api-v2.pump.fun',
}

/**
 * Generic fetch wrapper with error handling
 */
export async function fetchPumpFun<T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: {
        ...PUMP_HEADERS,
        ...(options.headers || {}),
      },
    })

    if (!res.ok) {
      console.error(
        `[PumpAPI] Request failed: ${url} :: ${res.status} ${res.statusText}`
      )
      return null
    }

    return (await res.json()) as T
  } catch (error: any) {
    console.error(`[PumpAPI] Request error: ${url} ::`, error?.message || error)
    return null
  }
}

// ========== Token Discovery ==========

export interface TrendingFilters {
  marketCapMinUSD?: number
  marketCapMaxUSD?: number
  volume24hMinUSD?: number
  volume24hMaxUSD?: number
  includeNsfw?: boolean
  limit?: number
}

export interface TrendingToken {
  mint: string
  name: string
  symbol: string
  description?: string
  imageUri?: string
  marketCapUSD: number
  marketCap: number
  volume24h: number // Always 0 from /coins/for-you - use get_token_metrics for actual volume
  priceChange24h: number // Always 0 from /coins/for-you - use get_token_metrics for actual change
  virtualSolReserves: number
  virtualTokenReserves: number
  complete: boolean
  isLive: boolean
  creator: string
  createdTimestamp: number
  bondingCurve: string
  associatedBondingCurve: string
  replyCount: number
  kingOfTheHillTimestamp: number | null
}

export async function getTrendingTokens(
  filters: TrendingFilters = {}
): Promise<TrendingToken[]> {
  const params = new URLSearchParams()

  if (filters.marketCapMinUSD) params.set('marketCapMin', filters.marketCapMinUSD.toString())
  if (filters.marketCapMaxUSD) params.set('marketCapMax', filters.marketCapMaxUSD.toString())
  if (filters.volume24hMinUSD) params.set('volume24hMin', filters.volume24hMinUSD.toString())
  if (filters.volume24hMaxUSD) params.set('volume24hMax', filters.volume24hMaxUSD.toString())
  if (filters.includeNsfw !== undefined) params.set('includeNsfw', filters.includeNsfw.toString())
  if (filters.limit) params.set('limit', filters.limit.toString())

  const url = `${API_ENDPOINTS.frontend}/coins/for-you?${params.toString()}`
  const data = await fetchPumpFun<any>(url)

  if (!data || !Array.isArray(data)) return []

  return data.map((token: any) => ({
    mint: token.mint,
    name: token.name || '',
    symbol: token.symbol || '',
    description: token.description || '',
    imageUri: token.image_uri || '',
    marketCapUSD: Number(token.usd_market_cap || token.market_cap || 0),
    marketCap: Number(token.market_cap || 0),
    volume24h: 0, // Not provided by /coins/for-you endpoint - need to call market-activity
    priceChange24h: 0, // Not provided by /coins/for-you endpoint - need to call market-activity
    virtualSolReserves: Number(token.virtual_sol_reserves || 0),
    virtualTokenReserves: Number(token.virtual_token_reserves || 0),
    complete: Boolean(token.complete),
    isLive: Boolean(token.is_currently_live),
    creator: token.creator,
    createdTimestamp: Number(token.created_timestamp || 0),
    bondingCurve: token.bonding_curve || '',
    associatedBondingCurve: token.associated_bonding_curve || '',
    replyCount: Number(token.reply_count || 0),
    kingOfTheHillTimestamp: token.king_of_the_hill_timestamp ? Number(token.king_of_the_hill_timestamp) : null,
  }))
}

// ========== Token Details ==========

export interface TokenDetails {
  mint: string
  name: string
  symbol: string
  description?: string
  imageUri?: string
  twitter?: string
  telegram?: string
  website?: string
  creator: string
  createdTimestamp: number
  totalSupply: number
  marketCapUSD: number
  priceSOL: number
  priceUSD: number
  virtualSolReserves: number
  virtualTokenReserves: number
  bondingCurve: string
  associatedBondingCurve: string
  complete: boolean
  isLive: boolean
  kingOfTheHillTimestamp?: number
}

export async function getTokenDetails(mint: string): Promise<TokenDetails | null> {
  const url = `${API_ENDPOINTS.frontend}/coins/${mint}`
  const data = await fetchPumpFun<any>(url)

  if (!data) return null

  // Fetch metadata if available
  let metadata = data.metadata
  if (!metadata && data.metadata_uri) {
    const metadataUri = data.metadata_uri.startsWith('ipfs://')
      ? data.metadata_uri.replace('ipfs://', 'https://pump.mypinata.cloud/ipfs/')
      : data.metadata_uri
    metadata = await fetchPumpFun<any>(metadataUri, {
      headers: { accept: 'application/json' },
    })
  }

  return {
    mint: data.mint,
    name: data.name || metadata?.name || '',
    symbol: data.symbol || metadata?.symbol || '',
    description: metadata?.description || data.description || '',
    imageUri: data.image_uri || metadata?.image || '',
    twitter: metadata?.twitter || data.twitter || '',
    telegram: metadata?.telegram || data.telegram || '',
    website: metadata?.website || data.website || '',
    creator: data.creator,
    createdTimestamp: Number(data.created_timestamp || 0),
    totalSupply: Number(data.total_supply || 0),
    marketCapUSD: Number(data.usd_market_cap || 0),
    priceSOL: Number(data.virtual_sol_reserves || 0) / Number(data.virtual_token_reserves || 1),
    priceUSD: Number(data.usd_market_cap || 0) / (Number(data.total_supply || 0) / 1e6),
    virtualSolReserves: Number(data.virtual_sol_reserves || 0),
    virtualTokenReserves: Number(data.virtual_token_reserves || 0),
    bondingCurve: data.bonding_curve || '',
    associatedBondingCurve: data.associated_bonding_curve || '',
    complete: Boolean(data.complete),
    isLive: Boolean(data.is_currently_live),
    kingOfTheHillTimestamp: data.king_of_the_hill_timestamp ? Number(data.king_of_the_hill_timestamp) : undefined,
  }
}

// ========== Market Activity ==========

export interface MarketActivityWindow {
  numTxs: number
  volumeUSD: number
  numUsers: number
  numBuys: number
  numSells: number
  buyVolumeUSD: number
  sellVolumeUSD: number
  numBuyers: number
  numSellers: number
  priceChangePercent: number
}

export interface MarketActivity {
  '5m': MarketActivityWindow
  '1h': MarketActivityWindow
  '6h': MarketActivityWindow
  '24h': MarketActivityWindow
}

export async function getMarketActivity(poolAddress: string): Promise<MarketActivity | null> {
  const url = `${API_ENDPOINTS.swap}/v1/pools/${poolAddress}/market-activity`
  const data = await fetchPumpFun<any>(url)

  if (!data) return null

  const parseWindow = (win: any): MarketActivityWindow => ({
    numTxs: Number(win.numTxs || 0),
    volumeUSD: Number(win.volumeUSD || 0),
    numUsers: Number(win.numUsers || 0),
    numBuys: Number(win.numBuys || 0),
    numSells: Number(win.numSells || 0),
    buyVolumeUSD: Number(win.buyVolumeUSD || 0),
    sellVolumeUSD: Number(win.sellVolumeUSD || 0),
    numBuyers: Number(win.numBuyers || 0),
    numSellers: Number(win.numSellers || 0),
    priceChangePercent: Number(win.priceChangePercent || 0),
  })

  return {
    '5m': parseWindow(data['5m'] || {}),
    '1h': parseWindow(data['1h'] || {}),
    '6h': parseWindow(data['6h'] || {}),
    '24h': parseWindow(data['24h'] || {}),
  }
}

// ========== Candles ==========

export interface Candle {
  timestamp: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  buyVolume?: string
  sellVolume?: string
}

export async function getTokenCandles(
  mint: string,
  interval: string = '1m',
  limit: number = 500,
  createdTs?: number
): Promise<Candle[]> {
  const params = new URLSearchParams({
    interval,
    limit: limit.toString(),
    currency: 'USD',
  })

  if (createdTs) {
    params.set('createdTs', createdTs.toString())
  }

  const url = `${API_ENDPOINTS.swap}/v2/coins/${mint}/candles?${params.toString()}`
  const data = await fetchPumpFun<any>(url)

  if (!data) return []

  const candlesArray = Array.isArray(data?.candles) ? data.candles : Array.isArray(data) ? data : []

  return candlesArray.map((candle: any) => ({
    timestamp: String(candle.timestamp || 0),
    open: String(candle.open || 0),
    high: String(candle.high || 0),
    low: String(candle.low || 0),
    close: String(candle.close || 0),
    volume: String(candle.volume || 0),
    buyVolume: candle.buyVolume ? String(candle.buyVolume) : undefined,
    sellVolume: candle.sellVolume ? String(candle.sellVolume) : undefined,
  }))
}

// ========== Recent Trades ==========

export interface Trade {
  timestamp: number
  side: 'buy' | 'sell'
  amountSol: number
  amountTokens: number
  priceSol: number
  priceUSD?: number
  userAddress: string
  signature?: string
}

export interface TradeParams {
  limit?: number
  cursor?: string | number
  minSolAmount?: number
}

export interface TradesResponse {
  trades: Trade[]
  nextCursor?: string
  stats: {
    totalTrades: number
    buyCount: number
    sellCount: number
    whaleTradesCount: number
    totalVolumeSol: number
    vwap: number
  }
}

export async function getRecentTrades(
  mint: string,
  params: TradeParams = {}
): Promise<TradesResponse> {
  const searchParams = new URLSearchParams({
    limit: (params.limit || 100).toString(),
    cursor: (params.cursor || 0).toString(),
  })

  if (params.minSolAmount) {
    searchParams.set('minSolAmount', params.minSolAmount.toString())
  }

  const url = `${API_ENDPOINTS.swap}/v2/coins/${mint}/trades?${searchParams.toString()}`
  const data = await fetchPumpFun<any>(url)

  if (!data) {
    return {
      trades: [],
      stats: {
        totalTrades: 0,
        buyCount: 0,
        sellCount: 0,
        whaleTradesCount: 0,
        totalVolumeSol: 0,
        vwap: 0,
      },
    }
  }

  const tradesArray = Array.isArray(data?.trades) ? data.trades : Array.isArray(data) ? data : []

  const trades = tradesArray.map((trade: any) => ({
    timestamp: Number(trade.timestamp || 0),
    side: trade.type === 'buy' || trade.is_buy ? 'buy' : 'sell',
    amountSol: Number(trade.sol_amount || trade.amountSol || 0) / 1e9,
    amountTokens: Number(trade.token_amount || trade.amountTokens || 0),
    priceSol: Number(trade.price_sol || trade.priceSol || 0),
    priceUSD: trade.price_usd ? Number(trade.price_usd) : undefined,
    userAddress: trade.user || trade.userAddress || '',
    signature: trade.signature || trade.txSig,
  }))

  // Calculate stats
  const buyCount = trades.filter((t: Trade) => t.side === 'buy').length
  const sellCount = trades.filter((t: Trade) => t.side === 'sell').length
  const whaleTradesCount = trades.filter((t: Trade) => t.amountSol >= 0.5).length
  const totalVolumeSol = trades.reduce((sum: number, t: Trade) => sum + t.amountSol, 0)
  const totalValue = trades.reduce((sum: number, t: Trade) => sum + t.amountSol * t.amountTokens, 0)
  const vwap = totalVolumeSol > 0 ? totalValue / totalVolumeSol : 0

  return {
    trades,
    nextCursor: data.nextCursor || data.cursor,
    stats: {
      totalTrades: trades.length,
      buyCount,
      sellCount,
      whaleTradesCount,
      totalVolumeSol,
      vwap,
    },
  }
}

// ========== Holders ==========

export interface Holder {
  address: string
  amount: number
  percentage: number
  solBalance: number
}

export interface HoldersData {
  topHolders: Holder[]
  totalHolders: number
  top10Share: number
  top20Share: number
  richHoldersCount: number
  giniCoefficient: number
}

export async function getTokenHolders(
  mint: string,
  richThreshold: number = 100
): Promise<HoldersData | null> {
  const url = `${API_ENDPOINTS.advanced}/coins/top-holders-and-sol-balance/${mint}`
  const data = await fetchPumpFun<any>(url)

  if (!data || !Array.isArray(data.topHolders)) return null

  const holders: Holder[] = data.topHolders.map((h: any) => ({
    address: h.address || '',
    amount: Number(h.amount || 0),
    percentage: Number(h.percentage || 0),
    solBalance: Number(h.solBalance || 0),
  }))

  const top10Share = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0)
  const top20Share = holders.slice(0, 20).reduce((sum, h) => sum + h.percentage, 0)
  const richHoldersCount = holders.filter((h) => h.solBalance >= richThreshold).length

  // Calculate Gini coefficient (simplified)
  const sortedByAmount = [...holders].sort((a, b) => a.amount - b.amount)
  let giniSum = 0
  let totalAmount = sortedByAmount.reduce((sum, h) => sum + h.amount, 0)

  if (totalAmount > 0) {
    for (let i = 0; i < sortedByAmount.length; i++) {
      giniSum += ((i + 1) * sortedByAmount[i].amount) / totalAmount
    }
    const giniCoefficient =
      (2 * giniSum) / sortedByAmount.length - (sortedByAmount.length + 1) / sortedByAmount.length
    return {
      topHolders: holders,
      totalHolders: holders.length,
      top10Share,
      top20Share,
      richHoldersCount,
      giniCoefficient: Math.max(0, Math.min(1, giniCoefficient)),
    }
  }

  return {
    topHolders: holders,
    totalHolders: holders.length,
    top10Share,
    top20Share,
    richHoldersCount,
    giniCoefficient: 0,
  }
}

// ========== SOL Price ==========

export interface SolPrice {
  solUsd: number
  timestamp: number
}

export async function getSolPrice(): Promise<SolPrice | null> {
  const url = `${API_ENDPOINTS.frontend}/sol-price`
  const data = await fetchPumpFun<any>(url)

  if (!data || typeof data.solPrice === 'undefined') return null

  return {
    solUsd: Number(data.solPrice),
    timestamp: Date.now(),
  }
}

// ========== Pool ATH ==========

export interface PoolATH {
  athMarketCap: number
  currentMarketCap?: number
  drawdownPercent?: number
}

export async function getPoolATH(poolAddress: string): Promise<PoolATH | null> {
  const url = `${API_ENDPOINTS.swap}/v1/pools/${poolAddress}/ath?currency=USD`
  const data = await fetchPumpFun<any>(url)

  if (!data) return null

  return {
    athMarketCap: Number(data.athMarketCap || 0),
    currentMarketCap: data.currentMarketCap ? Number(data.currentMarketCap) : undefined,
    drawdownPercent: data.drawdownPercent ? Number(data.drawdownPercent) : undefined,
  }
}

