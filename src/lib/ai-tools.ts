/**
 * AI Trading Tools - Registry Pattern
 * Comprehensive tool set for AI traders with validation and execution
 */

import * as PumpAPI from './pump-api'
import * as RiskProfiles from './risk-profiles'
import { parsePaginationParams, parseDateRange, parseTimeSeriesParams } from './pagination'
import { getUserBalance, getUserPortfolio } from './trading'
import { submitBuyOrder, submitSellOrder } from './orders'
import { prisma } from './db'
import { Decimal } from '@prisma/client/runtime/library'

// ========== Tool Definition Types ==========

export interface ToolDefinition {
  name: string
  description: string
  category: 'market' | 'portfolio' | 'orders' | 'execution' | 'risk' | 'analysis'
  riskLevel: 'safe' | 'medium' | 'high'
  rateLimit?: { calls: number; windowMs: number }
  cacheSeconds?: number
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  execute: (args: any, userId: string) => Promise<any>
  validate?: (args: any) => { valid: boolean; errors?: string[] }
}

// ========== Tool Registry ==========

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // ========== CATEGORY 1: Market Discovery & Token Data ==========

  search_tokens: {
    name: 'search_tokens',
    description:
      'Search pump.fun tokens by name, symbol, or keyword. Returns matching mints with metadata so you can pick the correct token before requesting detailed analytics.',
    category: 'market',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Token name, symbol, or keyword to search for' },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10, max: 50)',
        },
        includeNsfw: {
          type: 'boolean',
          description: 'Include NSFW tokens in results (default: false)',
        },
      },
      required: ['query'],
    },
    validate: (args) => {
      const raw = (args.query ?? args.searchTerm ?? '').trim()
      if (!raw || raw.length < 2) {
        return { valid: false, errors: ['query must be at least 2 characters'] }
      }
      return { valid: true }
    },
    execute: async (args) => {
      const query = (args.query ?? args.searchTerm ?? '').trim()
      const limit = Math.min(args.limit || 10, 50)
      const includeNsfw = Boolean(args.includeNsfw)

      const results = await PumpAPI.searchTokens(query, { limit, includeNsfw })

      return {
        query,
        count: results.length,
        tokens: results.map((token) => ({
          mint: token.mint,
          name: token.name,
          symbol: token.symbol,
          description: token.description || '',
          imageUri: token.imageUri || '',
          metadataUri: token.metadataUri || '',
          socials: {
            twitter: token.twitter || null,
            telegram: token.telegram || null,
            website: token.website || null,
          },
          createdTimestamp: token.createdTimestamp ?? null,
          usdMarketCap: token.usdMarketCap ?? null,
          marketCap: token.marketCap ?? null,
          complete: token.complete ?? null,
          isLive: token.isLive ?? null,
        })),
        timestamp: Date.now(),
      }
    },
  },

  get_trending_tokens: {
    name: 'get_trending_tokens',
    description: `Get trending tokens with comprehensive analytics. This is your PRIMARY discovery tool - use it FIRST to find opportunities.
    
Returns detailed metrics including:
- Price history (5m, 1h, 6h, 24h changes)
- Volume trends across multiple timeframes
- Market cap and price per 1M tokens
- Top 10 holders with SOL balances (identifies whales/risk)
- Trade distribution (buy/sell ratio, unique traders)
- Volatility indicators

After finding interesting tokens, use get_token_details for bonding curve status, get_recent_trades for momentum, and get_top_holders for full holder analysis.`,
    category: 'market',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        sortBy: {
          type: 'string',
          description: 'Sort by: volume, trades, marketCap, priceChange (default: volume)',
          enum: ['volume', 'trades', 'marketCap', 'priceChange'],
        },
        timeframe: {
          type: 'string',
          description: 'Timeframe for volume/trades: 1m, 5m, 1h, 6h, 24h (default: 1h)',
          enum: ['1m', '5m', '1h', '6h', '24h'],
        },
        minVolumeSol: { type: 'number', description: 'Minimum volume in SOL for the timeframe' },
        maxVolumeSol: { type: 'number', description: 'Maximum volume in SOL for the timeframe' },
        minTrades: { type: 'number', description: 'Minimum number of trades in timeframe' },
        minMarketCapUSD: { type: 'number', description: 'Minimum market cap in USD' },
        maxMarketCapUSD: { type: 'number', description: 'Maximum market cap in USD' },
        onlyLive: { type: 'boolean', description: 'Only show live/incomplete tokens (default: false)' },
        onlyComplete: { type: 'boolean', description: 'Only show graduated tokens (default: false)' },
        limit: { type: 'number', description: 'Max results (default: 10, max: 100)' },
        includeHolderAnalysis: { type: 'boolean', description: 'Include top 10 holders with SOL balances (default: true)' },
      },
    },
    execute: async (args, userId) => {
      const sortBy = args.sortBy || 'volume'
      const timeframe = args.timeframe || '1h'
      const limit = Math.min(args.limit || 10, 100)

      // Get current SOL price for USD conversions
      const { getLatestSolPrice } = await import('./metrics')
      const solPrice = (await getLatestSolPrice()) || 157

      // Calculate timeframe cutoff
      const timeframeMs: Record<string, number> = {
        '1m': 60 * 1000,
        '5m': 5 * 60 * 1000,
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
      }
      const cutoffTime = new Date(Date.now() - timeframeMs[timeframe])

      // Build query for tokens with recent activity
      const tokensWithActivity = await prisma.token.findMany({
        where: {
          ...(args.onlyLive ? { completed: false } : {}),
          ...(args.onlyComplete ? { completed: true } : {}),
          trades: {
            some: {
              createdAt: { gte: cutoffTime },
            },
          },
        },
        include: {
          price: true,
          trades: {
            where: { createdAt: { gte: cutoffTime } },
            select: {
              amountSol: true,
              amountUsd: true,
              priceSol: true,
              type: true,
              createdAt: true,
              userAddress: true,
            },
          },
        },
        take: limit * 3, // Get more than needed for filtering
      })


      // Calculate stats for each token
      const tokensWithStats = tokensWithActivity
        .map((token) => {
          const trades = token.trades
          const volumeSol = trades.reduce((sum, t) => sum + Number(t.amountSol), 0)
          const volumeUSD = volumeSol * solPrice
          const tradeCount = trades.length
          const buyCount = trades.filter((t) => t.type === 1).length
          const sellCount = trades.filter((t) => t.type === 2).length
          const uniqueTraders = new Set(trades.map((t) => t.userAddress)).size

          // Calculate price change using actual priceSol from trades
          let priceChange = 0
          if (trades.length >= 2) {
            const sortedTrades = [...trades].sort(
              (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
            )
            const firstPrice = Number(sortedTrades[0].priceSol)
            const lastPrice = Number(sortedTrades[sortedTrades.length - 1].priceSol)
            if (firstPrice > 0) {
              priceChange = ((lastPrice - firstPrice) / firstPrice) * 100
            }
          }

          const currentPriceSol = token.price ? Number(token.price.priceSol) : 0
          const currentPriceUSD = currentPriceSol * solPrice
          const marketCapUSD = currentPriceUSD * Number(token.totalSupply)

          return {
            ...token,
            stats: {
              volumeSol,
              volumeUSD,
              tradeCount,
              buyCount,
              sellCount,
              uniqueTraders,
              priceChange,
              marketCapUSD,
              currentPriceSol,
              currentPriceUSD,
            },
          }
        })
        .filter((t) => {
          // Apply filters
          if (args.minVolumeSol && t.stats.volumeSol < args.minVolumeSol) return false
          if (args.maxVolumeSol && t.stats.volumeSol > args.maxVolumeSol) return false
          if (args.minTrades && t.stats.tradeCount < args.minTrades) return false
          if (args.minMarketCapUSD && t.stats.marketCapUSD < args.minMarketCapUSD) return false
          if (args.maxMarketCapUSD && t.stats.marketCapUSD > args.maxMarketCapUSD) return false
          return true
        })

      // Sort based on sortBy parameter
      tokensWithStats.sort((a, b) => {
        switch (sortBy) {
          case 'volume':
            return b.stats.volumeSol - a.stats.volumeSol
          case 'trades':
            return b.stats.tradeCount - a.stats.tradeCount
          case 'marketCap':
            return b.stats.marketCapUSD - a.stats.marketCapUSD
          case 'priceChange':
            return b.stats.priceChange - a.stats.priceChange
          default:
            return b.stats.volumeSol - a.stats.volumeSol
        }
      })

      // Take top N
      const topTokens = tokensWithStats.slice(0, limit)

      // Fetch multi-timeframe data and holder analysis for top tokens
      const includeHolders = args.includeHolderAnalysis !== false
      const enrichedTokens = await Promise.all(
        topTokens.map(async (t) => {
          // Calculate multi-timeframe using ALL trades for the token (not limited to selected timeframe)
          const timeframes = {
            '5m': 5 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
          }

          // Fetch ALL recent trades across all timeframes for this token
          const allRecentTrades = await prisma.trade.findMany({
            where: {
              tokenId: t.id, // Use Token.id not mintAddress!
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
            },
            select: {
              amountSol: true,
              priceSol: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
          })

          const multiTimeframeData: any = {}
          for (const [tf, ms] of Object.entries(timeframes)) {
            const tfCutoff = Date.now() - ms
            
            // Filter the already-fetched trades by timeframe
            const tfTrades = allRecentTrades.filter(
              (trade) => trade.createdAt.getTime() >= tfCutoff
            )

            const volume = tfTrades.reduce((sum, tr) => sum + Number(tr.amountSol), 0)
            let priceChangePct = 0
            if (tfTrades.length >= 2) {
              const firstPrice = Number(tfTrades[0].priceSol)
              const lastPrice = Number(tfTrades[tfTrades.length - 1].priceSol)
              if (firstPrice > 0) {
                priceChangePct = ((lastPrice - firstPrice) / firstPrice) * 100
              }
            }

            multiTimeframeData[tf] = {
              volumeSol: Number(volume.toFixed(4)),
              volumeUSD: Number((volume * solPrice).toFixed(2)),
              priceChangePct: Number(priceChangePct.toFixed(2)),
              tradeCount: tfTrades.length,
            }
          }

          // Calculate volatility (standard deviation of price changes) using already-fetched trades
          const recentPrices = allRecentTrades
            .filter((trade) => trade.createdAt.getTime() >= Date.now() - timeframeMs[timeframe])
            .slice(0, 50)

          let volatility = 0
          if (recentPrices.length > 1) {
            const prices = recentPrices.map((p) => Number(p.priceSol))
            const mean = prices.reduce((a, b) => a + b, 0) / prices.length
            const variance = prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length
            volatility = Math.sqrt(variance) / mean // Coefficient of variation
          }

          // Fetch top holders
          let holderAnalysis = null
          if (includeHolders) {
            try {
              const holdersData = await PumpAPI.getTokenHolders(t.mintAddress)
              if (holdersData && holdersData.topHolders) {
                const top10 = holdersData.topHolders.slice(0, 10)
                const totalSupply = Number(t.totalSupply)
                
                holderAnalysis = {
                  top10Holders: top10.map((h: any) => {
                    const amountTokens = Number(h.amount)
                    const percentOfSupply = totalSupply > 0 ? (amountTokens / totalSupply) * 100 : 0
                    return {
                      address: h.address.substring(0, 8) + '...',
                      amountTokens: amountTokens,
                      percentOfSupply: Number(percentOfSupply.toFixed(4)), // No scientific notation
                      solBalance: Number(h.solBalance),
                    }
                  }),
                  top10Concentration: totalSupply > 0 
                    ? Number(((top10.reduce((sum: number, h: any) => sum + Number(h.amount), 0) / totalSupply) * 100).toFixed(4))
                    : 0,
                  whaleCount: top10.filter((h: any) => Number(h.solBalance) > 100).length,
                }
              }
            } catch (error) {
              console.warn(`Failed to fetch holders for ${t.mintAddress}:`, error)
            }
          }

          return {
            mint: t.mintAddress,
            symbol: t.symbol,
            name: t.name,
            
            // Price metrics
            marketCapUSD: t.stats.marketCapUSD,
            priceSol: t.stats.currentPriceSol,
            pricePer1MTokens: t.stats.currentPriceSol * 1e6, // Price per 1 million tokens (clearer!)
            priceUSD: t.stats.currentPriceUSD,
            
            // Current timeframe data
            volume: {
              sol: t.stats.volumeSol,
              usd: t.stats.volumeUSD,
              timeframe,
            },
            trades: {
              total: t.stats.tradeCount,
              buys: t.stats.buyCount,
              sells: t.stats.sellCount,
              uniqueTraders: t.stats.uniqueTraders,
              buyRatio: t.stats.tradeCount > 0 ? t.stats.buyCount / t.stats.tradeCount : 0,
            },
            priceChange: {
              percent: t.stats.priceChange,
              timeframe,
            },
            
            // Multi-timeframe analysis
            multiTimeframe: multiTimeframeData,
            
            // Risk indicators
            volatility: {
              coefficient: volatility,
              level: volatility > 0.5 ? 'HIGH' : volatility > 0.2 ? 'MODERATE' : 'LOW',
            },
            
            // Holder analysis (if included)
            ...(holderAnalysis ? { holders: holderAnalysis } : {}),
            
            // Age in hours for readability (createdAt is in microseconds, convert to ms)
            ageHours: Math.floor((Date.now() - Number(t.createdAt) / 1000) / (1000 * 60 * 60)),
          }
        })
      )

      return {
        tokens: enrichedTokens,
        count: enrichedTokens.length,
        sortedBy: sortBy,
        timeframe,
        timestamp: Date.now(),
      }
    },
  },

  get_token_details: {
    name: 'get_token_details',
    description: 'Get comprehensive details about a specific token including price, market cap, metadata, and bonding curve status.',
    category: 'market',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const details = await PumpAPI.getTokenDetails(args.mintAddress)
      if (!details) throw new Error('Token not found')

      return {
        mint: details.mint,
        symbol: details.symbol,
        name: details.name,
        description: details.description || '',
        imageUri: details.imageUri || '',
        socials: {
          twitter: details.twitter || null,
          telegram: details.telegram || null,
          website: details.website || null,
        },
        creator: details.creator,
        createdTimestamp: details.createdTimestamp,
        marketCapUSD: details.marketCapUSD,
        priceSol: details.priceSOL,
        priceUSD: details.priceUSD,
        totalSupply: details.totalSupply,
        virtualReserves: {
          sol: details.virtualSolReserves,
          tokens: details.virtualTokenReserves,
        },
        bondingCurve: {
          address: details.bondingCurve,
          associated: details.associatedBondingCurve,
          complete: details.complete,
          isLive: details.isLive,
        },
        timestamp: Date.now(),
      }
    },
  },

  get_token_metrics: {
    name: 'get_token_metrics',
    description: 'Get comprehensive market activity metrics across multiple time windows (5m, 1h, 6h, 24h). Includes transaction counts, volumes, buyer/seller ratios, and price changes.',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        poolAddress: { type: 'string', description: 'Pool/bonding curve address' },
      },
      required: ['poolAddress'],
    },
    execute: async (args, userId) => {
      const activity = await PumpAPI.getMarketActivity(args.poolAddress)
      if (!activity) throw new Error('Market activity not found')

      // Calculate derived metrics
      const calculate = (window: PumpAPI.MarketActivityWindow) => {
        const buySellImbalance =
          window.buyVolumeUSD + window.sellVolumeUSD > 0
            ? (window.buyVolumeUSD - window.sellVolumeUSD) / (window.buyVolumeUSD + window.sellVolumeUSD)
            : 0

        const buyerSellerRatio = window.numSellers > 0 ? window.numBuyers / window.numSellers : window.numBuyers

        return {
          ...window,
          buySellImbalance,
          buyerSellerRatio,
          avgTxSize: window.numTxs > 0 ? window.volumeUSD / window.numTxs : 0,
        }
      }

      return {
        '5m': calculate(activity['5m']),
        '1h': calculate(activity['1h']),
        '6h': calculate(activity['6h']),
        '24h': calculate(activity['24h']),
        timestamp: Date.now(),
      }
    },
  },

  get_token_candles: {
    name: 'get_token_candles',
    description: 'Get OHLCV candle data for technical analysis. Supports multiple timeframes and pagination for historical data.',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        interval: {
          type: 'string',
          description: 'Candle interval',
          enum: ['1m', '5m', '1h', '6h', '24h'],
        },
        limit: { type: 'number', description: 'Number of candles (default: 100, max: 1000)' },
        createdTs: { type: 'number', description: 'Optional: Token creation timestamp for filtering' },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const interval = args.interval || '1m'
      const limit = Math.min(args.limit || 100, 1000)

      const candles = await PumpAPI.getTokenCandles(args.mintAddress, interval, limit, args.createdTs)

      // Calculate technical indicators (simple implementations)
      const closes = candles.map((c) => parseFloat(c.close)).filter((v) => !isNaN(v))

      let ema20 = 0,
        ema50 = 0,
        rsi = 50

      if (closes.length >= 20) {
        // Simple EMA calculation
        ema20 = closes.slice(-20).reduce((sum, val) => sum + val, 0) / 20
      }
      if (closes.length >= 50) {
        ema50 = closes.slice(-50).reduce((sum, val) => sum + val, 0) / 50
      }

      // Simple RSI calculation (last 14 periods)
      if (closes.length >= 15) {
        let gains = 0,
          losses = 0
        for (let i = closes.length - 14; i < closes.length; i++) {
          const change = closes[i] - closes[i - 1]
          if (change > 0) gains += change
          else losses += Math.abs(change)
        }
        const avgGain = gains / 14
        const avgLoss = losses / 14
        const rs = avgLoss !== 0 ? avgGain / avgLoss : 100
        rsi = 100 - 100 / (1 + rs)
      }

      return {
        candles: candles.map((c) => ({
          timestamp: c.timestamp,
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: parseFloat(c.volume),
        })),
        count: candles.length,
        interval,
        indicators: {
          ema20,
          ema50,
          rsi,
          trend: ema20 > ema50 ? 'bullish' : ema20 < ema50 ? 'bearish' : 'neutral',
        },
        timestamp: Date.now(),
      }
    },
  },

  get_token_holders: {
    name: 'get_token_holders',
    description: 'Get top token holders with SOL balances for whale tracking and concentration analysis. Includes Gini coefficient for distribution fairness.',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        richThreshold: {
          type: 'number',
          description: 'SOL balance threshold to count as "rich holder" (default: 100)',
        },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const holders = await PumpAPI.getTokenHolders(args.mintAddress, args.richThreshold || 100)
      if (!holders) throw new Error('Holder data not found')

      return {
        topHolders: holders.topHolders.slice(0, 20).map((h) => ({
          address: h.address,
          amount: h.amount,
          percentage: h.percentage,
          solBalance: h.solBalance,
        })),
        totalHolders: holders.totalHolders,
        concentration: {
          top10Share: holders.top10Share,
          top20Share: holders.top20Share,
          giniCoefficient: holders.giniCoefficient,
        },
        richHoldersCount: holders.richHoldersCount,
        timestamp: Date.now(),
      }
    },
  },

  // ========== CATEGORY 2: Trade History & Analysis ==========

  get_recent_trades: {
    name: 'get_recent_trades',
    description: 'Get recent on-chain trades for a token with whale detection and microstructure analysis. Use for understanding current market dynamics.',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        limit: { type: 'number', description: 'Max trades to return (default: 100, max: 500)' },
        cursor: { type: 'string', description: 'Pagination cursor for next page' },
        minSolAmount: { type: 'number', description: 'Filter trades >= this SOL amount' },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const params: PumpAPI.TradeParams = {
        limit: Math.min(args.limit || 100, 500),
        cursor: args.cursor,
        minSolAmount: args.minSolAmount,
      }

      const result = await PumpAPI.getRecentTrades(args.mintAddress, params)

      return {
        trades: result.trades.map((t) => ({
          timestamp: t.timestamp,
          side: t.side,
          amountSol: t.amountSol,
          amountTokens: t.amountTokens,
          priceSol: t.priceSol,
          priceUSD: t.priceUSD || null,
          userAddress: t.userAddress,
          signature: t.signature,
          isWhale: t.amountSol >= 0.5,
        })),
        stats: result.stats,
        nextCursor: result.nextCursor,
        hasMore: !!result.nextCursor,
      }
    },
  },

  get_user_trades: {
    name: 'get_user_trades',
    description: 'Get trade history for the AI trader or any user. Includes P/L analysis and filtering by token/date/type.',
    category: 'portfolio',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (defaults to current AI trader)' },
        mintAddress: { type: 'string', description: 'Filter by token mint address' },
        type: { type: 'string', description: 'Filter by type: buy, sell', enum: ['buy', 'sell'] },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' },
        limit: { type: 'number', description: 'Max trades (default: 50, max: 500)' },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
    },
    execute: async (args, userId) => {
      const targetUserId = args.userId || userId
      const pagination = parsePaginationParams({ limit: args.limit, offset: args.offset })
      const dateRange = args.startDate || args.endDate ? parseDateRange({ startDate: args.startDate, endDate: args.endDate }) : null

      const where: any = { userId: targetUserId }
      if (args.mintAddress) {
        const token = await prisma.token.findUnique({ where: { mintAddress: args.mintAddress } })
        if (token) where.tokenId = token.id
      }
      if (args.type) {
        where.type = args.type === 'buy' ? 1 : 2
      }
      if (dateRange) {
        where.createdAt = { gte: dateRange.startDate, lte: dateRange.endDate }
      }

      const [trades, total] = await Promise.all([
        prisma.userTrade.findMany({
          where,
          include: { token: true },
          orderBy: { createdAt: 'desc' },
          take: pagination.limit + 1,
          skip: pagination.offset || 0,
        }),
        prisma.userTrade.count({ where }),
      ])

      const hasMore = trades.length > pagination.limit
      const items = hasMore ? trades.slice(0, pagination.limit) : trades

      const tokenMap = new Map<string, typeof items[number]['token']>()
      for (const trade of items) {
        if (trade.token) {
          tokenMap.set(trade.token.id, trade.token)
        }
      }
      if (tokenMap.size > 0) {
      }

      return {
        trades: items.map((t) => ({
          id: t.id.toString(),
          timestamp: t.createdAt.toISOString(),
          type: t.type === 1 ? 'buy' : 'sell',
          mint: t.token.mintAddress,
          symbol: t.token.symbol,
          name: t.token.name,
          amountSol: Number(t.amountSol),
          amountTokens: Number(t.amountTokens),
          priceSol: Number(t.priceSol),
        })),
        pagination: {
          limit: pagination.limit,
          offset: pagination.offset || 0,
          total,
          hasMore,
        },
      }
    },
  },

  get_trade_tape: {
    name: 'get_trade_tape',
    description: 'Get live order flow and trade tape for analyzing real-time liquidity and slippage.',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        limit: { type: 'number', description: 'Max trades (default: 100)' },
        before: { type: 'number', description: 'Before timestamp (unix ms)' },
        after: { type: 'number', description: 'After timestamp (unix ms)' },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const token = await prisma.token.findUnique({ where: { mintAddress: args.mintAddress } })
      if (!token) throw new Error('Token not found')

      const timeSeries = parseTimeSeriesParams({
        before: args.before,
        after: args.after,
        limit: args.limit,
      })

      const where: any = { tokenId: token.id }
      if (timeSeries.beforeTimestamp) {
        where.timestamp = { ...where.timestamp, lt: new Date(timeSeries.beforeTimestamp) }
      }
      if (timeSeries.afterTimestamp) {
        where.timestamp = { ...where.timestamp, gt: new Date(timeSeries.afterTimestamp) }
      }

      const trades = await prisma.trade.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: timeSeries.limit,
      })

      return {
        trades: trades.map((t) => ({
          timestamp: Number(t.timestamp),
          side: t.type === 1 ? 'buy' : 'sell',
          amountSol: Number(t.amountSol),
          amountTokens: Number(t.baseAmount),
          amountUSD: Number(t.amountUsd),
          priceSol: Number(t.priceSol),
          userAddress: t.userAddress,
        })),
        count: trades.length,
      }
    },
  },

  // ========== CATEGORY 3: Portfolio & Balance Management ==========

  get_portfolio: {
    name: 'get_portfolio',
    description: 'Get complete portfolio with all positions, balances, P/L, and position details.',
    category: 'portfolio',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (defaults to current AI trader)' },
      },
    },
    execute: async (args, userId) => {
      const targetUserId = args.userId || userId
      const [balance, portfolio] = await Promise.all([
        getUserBalance(targetUserId),
        getUserPortfolio(targetUserId),
      ])

      const solPrice = await PumpAPI.getSolPrice()
      const solUsd = solPrice?.solUsd || 0

      const positions = portfolio.map((p) => ({
        mint: p.token.mintAddress,
        symbol: p.token.symbol,
        name: p.token.name,
        amountTokens: Number(p.amount),
        avgBuyPriceSol: Number(p.avgBuyPrice),
        currentPriceSol: Number(p.token.price?.priceSol || 0),
        valueUsd: Number(p.amount) * Number(p.token.price?.priceUsd || 0),
        valueSol: Number(p.amount) * Number(p.token.price?.priceSol || 0),
        unrealizedPnlSol: (Number(p.token.price?.priceSol || 0) - Number(p.avgBuyPrice)) * Number(p.amount),
        unrealizedPnlPct:
          Number(p.avgBuyPrice) > 0
            ? ((Number(p.token.price?.priceSol || 0) - Number(p.avgBuyPrice)) / Number(p.avgBuyPrice)) * 100
            : 0,
      }))

      const totalValueSol = positions.reduce((sum, p) => sum + p.valueSol, 0)
      const totalUnrealizedSol = positions.reduce((sum, p) => sum + p.unrealizedPnlSol, 0)

      return {
        solBalance: balance,
        solBalanceUsd: balance * solUsd,
        positions,
        summary: {
          totalPositions: positions.length,
          totalValueSol,
          totalValueUsd: totalValueSol * solUsd,
          totalUnrealizedSol,
          totalUnrealizedUsd: totalUnrealizedSol * solUsd,
          equitySol: balance + totalValueSol,
          equityUsd: (balance + totalValueSol) * solUsd,
        },
        timestamp: Date.now(),
      }
    },
  },

  get_wallet_balance: {
    name: 'get_wallet_balance',
    description: 'Get SOL balance for the AI trader or any Solana address.',
    category: 'portfolio',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (defaults to current AI trader)' },
        address: { type: 'string', description: 'Solana address to check (if not using userId)' },
      },
    },
    execute: async (args, userId) => {
      if (args.address) {
        // For external addresses, would need Helius RPC integration
        throw new Error('External address balance checking not yet implemented')
      }

      const targetUserId = args.userId || userId
      const balance = await getUserBalance(targetUserId)
      const solPrice = await PumpAPI.getSolPrice()

      return {
        solBalance: balance,
        solBalanceUsd: balance * (solPrice?.solUsd || 0),
        timestamp: Date.now(),
      }
    },
  },

  get_position_details: {
    name: 'get_position_details',
    description: 'Get detailed analysis of a specific position including all trades, P/L breakdown, and holding metrics.',
    category: 'portfolio',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        userId: { type: 'string', description: 'User ID (defaults to current AI trader)' },
      },
      required: ['mintAddress'],
    },
    execute: async (args, userId) => {
      const targetUserId = args.userId || userId
      const token = await prisma.token.findUnique({
        where: { mintAddress: args.mintAddress },
        include: { price: true },
      })
      if (!token) throw new Error('Token not found')

      const [position, trades] = await Promise.all([
        prisma.userPortfolio.findUnique({
          where: {
            userId_tokenId: {
              userId: targetUserId,
              tokenId: token.id,
            },
          },
        }),
        prisma.userTrade.findMany({
          where: {
            userId: targetUserId,
            tokenId: token.id,
          },
          orderBy: { createdAt: 'asc' },
        }),
      ])

      if (!position) {
        return {
          hasPosition: false,
          mint: args.mintAddress,
          message: 'No position found',
        }
      }

      const buys = trades.filter((t) => t.type === 1)
      const sells = trades.filter((t) => t.type === 2)

      const totalBought = buys.reduce((sum, t) => sum + Number(t.amountTokens), 0)
      const totalSold = sells.reduce((sum, t) => sum + Number(t.amountTokens), 0)
      const totalCostSol = buys.reduce((sum, t) => sum + Number(t.amountSol), 0)
      const totalRevenueSol = sells.reduce((sum, t) => sum + Number(t.amountSol), 0)

      const currentPriceSol = Number(token.price?.priceSol || 0)
      const currentValueSol = Number(position.amount) * currentPriceSol
      const unrealizedPnlSol = currentValueSol - Number(position.avgBuyPrice) * Number(position.amount)

      const firstTrade = trades[0]
      const holdingPeriodDays = firstTrade
        ? (Date.now() - firstTrade.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        : 0

      return {
        hasPosition: true,
        mint: args.mintAddress,
        symbol: token.symbol,
        name: token.name,
        currentHolding: Number(position.amount),
        avgBuyPriceSol: Number(position.avgBuyPrice),
        currentPriceSol,
        currentValueSol,
        unrealizedPnlSol,
        unrealizedPnlPct:
          Number(position.avgBuyPrice) > 0 ? (unrealizedPnlSol / (Number(position.avgBuyPrice) * Number(position.amount))) * 100 : 0,
        tradeSummary: {
          totalBought,
          totalSold,
          totalCostSol,
          totalRevenueSol,
          realizedPnlSol: totalRevenueSol - (totalSold / totalBought) * totalCostSol,
          tradeCount: trades.length,
          buyCount: buys.length,
          sellCount: sells.length,
        },
        holdingPeriodDays,
        firstTradeDate: firstTrade?.createdAt.toISOString(),
        lastTradeDate: trades[trades.length - 1]?.createdAt.toISOString(),
      }
    },
  },

  // ========== CATEGORY 4: Order Management ==========

  create_limit_order: {
    name: 'create_limit_order',
    description: 'Create a limit order (buy or sell) that executes when price reaches the limit. IMPORTANT: Validate with risk profile before creating.',
    category: 'orders',
    riskLevel: 'high',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        side: { type: 'string', description: 'Order side', enum: ['buy', 'sell'] },
        amountSol: { type: 'number', description: 'Amount in SOL (for buy orders)' },
        amountTokens: { type: 'number', description: 'Amount in tokens (for sell orders)' },
        limitPriceSol: { type: 'number', description: 'Limit price in SOL per token' },
        slippageBps: { type: 'number', description: 'Max slippage in basis points (default: 500)' },
      },
      required: ['mintAddress', 'side', 'limitPriceSol'],
    },
    execute: async (args, userId) => {
      // Validate risk profile first
      const solPrice = await PumpAPI.getSolPrice()
      const amountUSD = args.side === 'buy' ? (args.amountSol || 0) * (solPrice?.solUsd || 0) : 0

      const validation = await RiskProfiles.validateTrade(userId, {
        mintAddress: args.mintAddress,
        side: args.side,
        amountUSD,
        slippageBps: args.slippageBps || 500,
      })

      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          violations: validation.violations,
        }
      }

      // Get wallet ID
      const wallet = await prisma.wallet.findFirst({
        where: { userId },
        select: { id: true },
      })

      if (!wallet) {
        return {
          success: false,
          error: 'Wallet not found',
        }
      }

      const order = await prisma.order.create({
        data: {
          userId,
          walletId: wallet.id,
          tokenMint: args.mintAddress,
          side: args.side,
          status: 'pending',
          qtySol: args.amountSol ? new Decimal(args.amountSol) : null,
          qtyTokens: args.amountTokens ? new Decimal(args.amountTokens) : null,
          limitPriceSol: new Decimal(args.limitPriceSol),
          slippageBps: args.slippageBps || 500,
        },
      })

      return {
        success: true,
        orderId: order.id,
        status: order.status,
        side: order.side,
        limitPriceSol: Number(order.limitPriceSol),
        createdAt: order.createdAt.toISOString(),
      }
    },
  },

  cancel_order: {
    name: 'cancel_order',
    description: 'Cancel a pending or open limit order.',
    category: 'orders',
    riskLevel: 'medium',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID to cancel' },
        cancelAll: { type: 'boolean', description: 'Cancel all open orders (ignores orderId)' },
      },
    },
    execute: async (args, userId) => {
      if (args.cancelAll) {
        const result = await prisma.order.updateMany({
          where: {
            userId,
            status: { in: ['pending', 'open', 'queued'] },
          },
          data: {
            status: 'cancelled',
          },
        })

        return {
          success: true,
          cancelledCount: result.count,
        }
      }

      if (!args.orderId) {
        throw new Error('Either orderId or cancelAll must be specified')
      }

      const order = await prisma.order.findUnique({ where: { id: args.orderId } })
      if (!order) throw new Error('Order not found')
      if (order.userId !== userId) throw new Error('Not authorized to cancel this order')
      if (!['pending', 'open', 'queued'].includes(order.status)) {
        throw new Error(`Cannot cancel order with status: ${order.status}`)
      }

      await prisma.order.update({
        where: { id: args.orderId },
        data: { status: 'cancelled' },
      })

      return {
        success: true,
        orderId: args.orderId,
        previousStatus: order.status,
      }
    },
  },

  get_open_orders: {
    name: 'get_open_orders',
    description: 'Get all active (pending/open/queued) limit orders.',
    category: 'orders',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Filter by token mint address' },
        side: { type: 'string', description: 'Filter by side', enum: ['buy', 'sell'] },
      },
    },
    execute: async (args, userId) => {
      const where: any = {
        userId,
        status: { in: ['pending', 'open', 'queued'] },
      }

      if (args.mintAddress) where.tokenMint = args.mintAddress
      if (args.side) where.side = args.side

      const orders = await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      return {
        orders: orders.map((o) => ({
          orderId: o.id,
          mint: o.tokenMint,
          side: o.side,
          status: o.status,
          qtySol: o.qtySol ? Number(o.qtySol) : null,
          qtyTokens: o.qtyTokens ? Number(o.qtyTokens) : null,
          limitPriceSol: o.limitPriceSol ? Number(o.limitPriceSol) : null,
          slippageBps: o.slippageBps,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        })),
        count: orders.length,
      }
    },
  },

  get_order_history: {
    name: 'get_order_history',
    description: 'Get historical orders (filled/cancelled/failed) with pagination.',
    category: 'orders',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status', enum: ['filled', 'cancelled', 'failed'] },
        mintAddress: { type: 'string', description: 'Filter by token' },
        limit: { type: 'number', description: 'Max orders (default: 50, max: 500)' },
        offset: { type: 'number', description: 'Offset for pagination' },
      },
    },
    execute: async (args, userId) => {
      const pagination = parsePaginationParams({ limit: args.limit, offset: args.offset })

      const where: any = { userId }
      if (args.status) where.status = args.status
      if (args.mintAddress) where.tokenMint = args.mintAddress

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: pagination.limit + 1,
          skip: pagination.offset || 0,
        }),
        prisma.order.count({ where }),
      ])

      const hasMore = orders.length > pagination.limit
      const items = hasMore ? orders.slice(0, pagination.limit) : orders

      return {
        orders: items.map((o) => ({
          orderId: o.id,
          mint: o.tokenMint,
          side: o.side,
          status: o.status,
          qtySol: o.qtySol ? Number(o.qtySol) : null,
          qtyTokens: o.qtyTokens ? Number(o.qtyTokens) : null,
          limitPriceSol: o.limitPriceSol ? Number(o.limitPriceSol) : null,
          txSig: o.txSig,
          createdAt: o.createdAt.toISOString(),
          updatedAt: o.updatedAt.toISOString(),
        })),
        pagination: {
          limit: pagination.limit,
          offset: pagination.offset || 0,
          total,
          hasMore,
        },
      }
    },
  },

  // ========== CATEGORY 5: Execution & Risk ==========

  execute_market_buy: {
    name: 'execute_market_buy',
    description: 'Execute an immediate market buy order. CRITICAL: Always check risk profile and estimate impact first!',
    category: 'execution',
    riskLevel: 'high',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        amountSol: { type: 'number', description: 'Amount in SOL to spend' },
        slippageBps: { type: 'number', description: 'Max slippage in basis points (default: 500)' },
      },
      required: ['mintAddress', 'amountSol'],
    },
    execute: async (args, userId) => {
      // Risk validation
      const solPrice = await PumpAPI.getSolPrice()
      const amountUSD = args.amountSol * (solPrice?.solUsd || 0)

      const validation = await RiskProfiles.validateTrade(userId, {
        mintAddress: args.mintAddress,
        side: 'buy',
        amountUSD,
        slippageBps: args.slippageBps || 500,
      })

      if (!validation.valid) {
        return {
          success: false,
          error: validation.reason,
          violations: validation.violations,
        }
      }

      // Get token ID
      const token = await prisma.token.findUnique({
        where: { mintAddress: args.mintAddress },
        select: { id: true },
      })

      if (!token) {
        return {
          success: false,
          error: 'Token not found',
        }
      }

      // Execute trade
      try {
        const result = await submitBuyOrder({
          userId,
          tokenId: token.id,
          amountSol: args.amountSol,
          limitPriceSol: args.limitPrice,
        })

        if (!result.success) {
          return {
            success: false,
            error: result.error,
          }
        }

        // Update risk usage
        await RiskProfiles.updateRiskUsage(userId, {
          mintAddress: args.mintAddress,
          side: 'buy',
          amountUSD,
          timestamp: new Date(),
        })

        return {
          success: true,
          status: result.status,
          orderId: result.orderId,
          walletId: result.walletId,
          tokensReceived: result.tokensReceived,
          fillPrice: result.fillPrice,
          timestamp: new Date().toISOString(),
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        }
      }
    },
  },

  execute_market_sell: {
    name: 'execute_market_sell',
    description: 'Execute an immediate market sell order. Validates holdings before execution.',
    category: 'execution',
    riskLevel: 'high',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        amountTokens: { type: 'number', description: 'Amount of tokens to sell' },
        slippageBps: { type: 'number', description: 'Max slippage in basis points (default: 500)' },
      },
      required: ['mintAddress', 'amountTokens'],
    },
    execute: async (args, userId) => {
      // Validate holdings
      const token = await prisma.token.findUnique({ where: { mintAddress: args.mintAddress } })
      if (!token) throw new Error('Token not found')

      const position = await prisma.userPortfolio.findUnique({
        where: {
          userId_tokenId: {
            userId,
            tokenId: token.id,
          },
        },
      })

      if (!position || Number(position.amount) < args.amountTokens) {
        return {
          success: false,
          error: `Insufficient balance. Have ${position ? Number(position.amount) : 0}, trying to sell ${args.amountTokens}`,
        }
      }

      // Get token ID
      const tokenData = await prisma.token.findUnique({
        where: { mintAddress: args.mintAddress },
        select: { id: true },
      })

      if (!tokenData) {
        return {
          success: false,
          error: 'Token not found',
        }
      }

      // Execute trade
      try {
        const result = await submitSellOrder({
          userId,
          tokenId: tokenData.id,
          amountTokens: args.amountTokens,
          limitPriceSol: args.limitPrice,
        })

        if (!result.success) {
          return {
            success: false,
            error: result.error,
          }
        }

        // Calculate USD value for risk tracking
        await RiskProfiles.updateRiskUsage(userId, {
          mintAddress: args.mintAddress,
          side: 'sell',
          amountUSD: 0, // Sells don't count toward daily spend
          timestamp: new Date(),
        })

        return {
          success: true,
          status: result.status,
          orderId: result.orderId,
          walletId: result.walletId,
          solReceived: result.solReceived,
          fillPrice: result.fillPrice,
          timestamp: new Date().toISOString(),
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        }
      }
    },
  },

  estimate_trade_impact: {
    name: 'estimate_trade_impact',
    description: 'Estimate price impact, slippage, and fees for a potential trade. Use before executing!',
    category: 'analysis',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        mintAddress: { type: 'string', description: 'Token mint address' },
        side: { type: 'string', description: 'Trade side', enum: ['buy', 'sell'] },
        amountSol: { type: 'number', description: 'Amount in SOL' },
      },
      required: ['mintAddress', 'side', 'amountSol'],
    },
    execute: async (args, userId) => {
      const details = await PumpAPI.getTokenDetails(args.mintAddress)
      if (!details) throw new Error('Token not found')

      const vSol = details.virtualSolReserves
      const vTok = details.virtualTokenReserves

      if (vSol === 0 || vTok === 0) {
        return {
          error: 'Insufficient liquidity data',
          canTrade: false,
        }
      }

      // CPMM formula: Δy = (Δx * y) / (x + Δx)
      const deltaX = args.amountSol
      const deltaY = (deltaX * vTok) / (vSol + deltaX)

      const effectivePrice = deltaX / deltaY
      const spotPrice = vSol / vTok
      const priceImpactBps = ((effectivePrice - spotPrice) / spotPrice) * 10000

      // Estimate fees (Solana + Raydium typical fees)
      const platformFeeSol = 0.000005 // 5000 lamports
      const tradingFeeBps = 30 // 0.3%
      const tradingFeeSol = (args.amountSol * tradingFeeBps) / 10000

      const totalFeeSol = platformFeeSol + tradingFeeSol
      const netAmountSol = args.amountSol - totalFeeSol

      return {
        canTrade: true,
        side: args.side,
        amountSol: args.amountSol,
        estimatedTokens: deltaY,
        spotPriceSol: spotPrice,
        effectivePriceSol: effectivePrice,
        priceImpactBps: Math.abs(priceImpactBps),
        priceImpactPercent: Math.abs(priceImpactBps) / 100,
        fees: {
          platformFeeSol,
          tradingFeeSol,
          totalFeeSol,
          totalFeeBps: (totalFeeSol / args.amountSol) * 10000,
        },
        netAmountSol,
        liquidity: {
          virtualSolReserves: vSol,
          virtualTokenReserves: vTok,
          liquidityDepth: vSol,
        },
        recommendation:
          priceImpactBps > 500
            ? 'High impact - consider smaller size or limit order'
            : priceImpactBps > 200
              ? 'Moderate impact - acceptable for market order'
              : 'Low impact - good execution expected',
      }
    },
  },

  // ========== CATEGORY 6: Risk & Configuration ==========

  get_risk_profile: {
    name: 'get_risk_profile',
    description: 'Get current risk profile settings and usage. Check before executing trades.',
    category: 'risk',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (args, userId) => {
      const [profile, usage, canTradeResult] = await Promise.all([
        RiskProfiles.getRiskProfile(userId),
        RiskProfiles.getTodayUsage(userId),
        RiskProfiles.canTrade(userId),
      ])

      const positionCount = await prisma.userPortfolio.count({
        where: {
          userId,
          amount: { gt: new Decimal(0.000001) },
        },
      })

      return {
        limits: {
          maxPositionSizeUSD: profile.maxPositionSizeUSD,
          maxDailySpendUSD: profile.maxDailySpendUSD,
          maxSlippageBps: profile.maxSlippageBps,
          cooldownSeconds: profile.cooldownSeconds,
          maxConcurrentPositions: profile.maxConcurrentPositions,
          minLiquidityUSD: profile.minLiquidityUSD,
        },
        usage: {
          todaySpentUSD: usage.spentUSD,
          todayTradesCount: usage.tradesCount,
          lastTradeAt: usage.lastTradeAt?.toISOString() || null,
          currentPositions: positionCount,
        },
        status: {
          canTrade: canTradeResult.canTrade,
          reason: canTradeResult.reason,
          cooldownRemaining: canTradeResult.cooldownRemaining,
        },
        blacklistedTokens: profile.blacklistedTokens,
        remainingToday: {
          spendUSD: Math.max(0, profile.maxDailySpendUSD - usage.spentUSD),
          positions: Math.max(0, profile.maxConcurrentPositions - positionCount),
        },
      }
    },
  },

  get_sol_price: {
    name: 'get_sol_price',
    description: 'Get current SOL/USD price for conversions and P/L calculations.',
    category: 'market',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (args, userId) => {
      const price = await PumpAPI.getSolPrice()
      if (!price) throw new Error('Failed to fetch SOL price')

      return {
        solPriceUsd: price.solUsd,
        timestamp: price.timestamp,
      }
    },
  },
}

// ========== Tool Registry Exports ==========

export const AI_TRADING_TOOLS = Object.values(TOOL_REGISTRY).map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
}))

export async function executeAITool(toolName: string, args: any, userId: string): Promise<any> {
  const tool = TOOL_REGISTRY[toolName]

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`)
  }

  console.log(`[AI Tool] Executing: ${toolName} (${tool.category}/${tool.riskLevel})`, args)

  // Validate if validator exists
  if (tool.validate) {
    const validation = tool.validate(args)
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors?.join(', ')}`)
    }
  }

  try {
    const result = await tool.execute(args, userId)
    console.log(`[AI Tool] Success: ${toolName}`)
    return result
  } catch (error: any) {
    console.error(`[AI Tool] Error in ${toolName}:`, error.message)
    throw error
  }
}

export function getToolsByCategory(category: string): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).filter((tool) => tool.category === category)
}

export function getToolsByRiskLevel(riskLevel: string): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY).filter((tool) => tool.riskLevel === riskLevel)
}
