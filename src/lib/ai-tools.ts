/**
 * AI Trading Tools - Registry Pattern
 * Comprehensive tool set for AI traders with validation and execution
 */

import * as PumpAPI from './pump-api'
import * as RiskProfiles from './risk-profiles'
import { parsePaginationParams, parseDateRange, parseTimeSeriesParams } from './pagination'
import { getUserBalance, getUserPortfolio, submitBuyOrder, submitSellOrder } from './trading'
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

  get_trending_tokens: {
    name: 'get_trending_tokens',
    description: 'Fetch trending tokens from pump.fun with market data, volume, and price movements. Use for discovering new trading opportunities.',
    category: 'market',
    riskLevel: 'safe',
    cacheSeconds: 0,
    parameters: {
      type: 'object',
      properties: {
        marketCapMin: { type: 'number', description: 'Minimum market cap in USD' },
        marketCapMax: { type: 'number', description: 'Maximum market cap in USD' },
        volume24hMin: { type: 'number', description: 'Minimum 24h volume in USD' },
        volume24hMax: { type: 'number', description: 'Maximum 24h volume in USD' },
        includeNsfw: { type: 'boolean', description: 'Include NSFW tokens (default: false)' },
        limit: { type: 'number', description: 'Max results (default: 20, max: 200)' },
      },
    },
    execute: async (args, userId) => {
      const filters: PumpAPI.TrendingFilters = {
        marketCapMinUSD: args.marketCapMin,
        marketCapMaxUSD: args.marketCapMax,
        volume24hMinUSD: args.volume24hMin,
        volume24hMaxUSD: args.volume24hMax,
        includeNsfw: args.includeNsfw || false,
        limit: Math.min(args.limit || 20, 200),
      }

      const tokens = await PumpAPI.getTrendingTokens(filters)

      return {
        tokens: tokens.map((t) => ({
          mint: t.mint,
          symbol: t.symbol,
          name: t.name,
          marketCapUSD: t.marketCapUSD,
          volume24h: t.volume24h || 0,
          priceChange24h: t.priceChange24h || 0,
          priceSol: (t.virtualSolReserves || 0) / (t.virtualTokenReserves || 1),
          complete: t.complete,
          isLive: t.isLive,
        })),
        count: tokens.length,
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
          timestamp: t.timestamp.getTime(),
          side: t.type === 1 ? 'buy' : 'sell',
          amountSol: Number(t.amountSol),
          amountTokens: Number(t.amountTokens),
          amountUSD: Number(t.amountUsd),
          priceUsd: Number(t.priceUsd),
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

      const order = await prisma.order.create({
        data: {
          userId,
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

      // Execute trade
      try {
        const result = await submitBuyOrder(userId, args.mintAddress, args.amountSol)

        // Update risk usage
        await RiskProfiles.updateRiskUsage(userId, {
          mintAddress: args.mintAddress,
          side: 'buy',
          amountUSD,
          timestamp: new Date(),
        })

        return {
          success: true,
          tradeId: result.trade?.id.toString(),
          amountSol: args.amountSol,
          amountTokens: result.trade ? Number(result.trade.amountTokens) : 0,
          fillPriceSol: result.trade ? Number(result.trade.priceSol) : 0,
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

      // Execute trade
      try {
        const result = await submitSellOrder(userId, args.mintAddress, args.amountTokens)

        // Calculate USD value for risk tracking
        const solPrice = await PumpAPI.getSolPrice()
        const amountUSD = (result.trade ? Number(result.trade.amountSol) : 0) * (solPrice?.solUsd || 0)

        await RiskProfiles.updateRiskUsage(userId, {
          mintAddress: args.mintAddress,
          side: 'sell',
          amountUSD: 0, // Sells don't count toward daily spend
          timestamp: new Date(),
        })

        return {
          success: true,
          tradeId: result.trade?.id.toString(),
          amountTokens: args.amountTokens,
          amountSol: result.trade ? Number(result.trade.amountSol) : 0,
          fillPriceSol: result.trade ? Number(result.trade.priceSol) : 0,
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
