import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import {
  getUserBalance,
  getUserPortfolio,
  getTokenPriceAtTime,
  executeBuyOrder,
  executeSellOrder,
} from './tools.js'

const prisma = new PrismaClient()

// API Key authentication
function verifyApiKey(apiKey: string | undefined): string | null {
  if (!apiKey) return null

  // Find user by API key hash
  // In production, you'd hash the provided key and compare
  // For now, simplified lookup
  return apiKey // This should be improved with proper hashing
}

// Get authenticated user from API key
async function getAuthenticatedUser(apiKey: string): Promise<string | null> {
  try {
    // Find API key (in production, hash the provided key first)
    const apiKeyRecord = await prisma.userApiKey.findFirst({
      where: {
        apiKeyHash: apiKey, // Should hash and compare
      },
      include: { user: true },
    })

    if (!apiKeyRecord || !apiKeyRecord.user.isActive) {
      return null
    }

    // Update last used
    await prisma.userApiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    })

    return apiKeyRecord.userId
  } catch (error) {
    return null
  }
}

const server = new Server(
  {
    name: 'pump-fun-mock-trader',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// List all available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'mcp_register_user',
        description: 'Register a new user account and get API key',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string', description: 'Username' },
            password: { type: 'string', description: 'Password' },
          },
          required: ['username', 'password'],
        },
      },
      {
        name: 'mcp_login',
        description: 'Login and get API key',
        inputSchema: {
          type: 'object',
          properties: {
            username: { type: 'string' },
            password: { type: 'string' },
          },
          required: ['username', 'password'],
        },
      },
      {
        name: 'get_token_info',
        description: 'Get token metadata by mint address',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string', description: 'Token mint address' },
          },
          required: ['token_address'],
        },
      },
      {
        name: 'get_token_price',
        description: 'Get token price at current or specific timestamp',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            timestamp: { type: 'string', description: 'Optional timestamp (milliseconds)' },
          },
          required: ['token_address'],
        },
      },
      {
        name: 'get_token_trades',
        description: 'Get trade history for a token',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            limit: { type: 'number' },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
          },
          required: ['token_address'],
        },
      },
      {
        name: 'get_market_activity',
        description: 'Get market activity stats for a token',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            period: { type: 'string', enum: ['5m', '1h', '6h', '24h'] },
          },
          required: ['token_address', 'period'],
        },
      },
      {
        name: 'get_candles',
        description: 'Get OHLCV candle data',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            interval: { type: 'string', enum: ['1m', '5m', '1h', '6h', '24h'] },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['token_address', 'interval'],
        },
      },
      {
        name: 'search_tokens',
        description: 'Search tokens by name or symbol',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' },
          },
          required: ['query'],
        },
      },
      {
        name: 'place_buy_order',
        description: 'Place a buy order (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            amount_sol: { type: 'number' },
          },
          required: ['token_address', 'amount_sol'],
        },
      },
      {
        name: 'place_sell_order',
        description: 'Place a sell order (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            token_address: { type: 'string' },
            amount_tokens: { type: 'number' },
          },
          required: ['token_address', 'amount_tokens'],
        },
      },
      {
        name: 'get_my_balance',
        description: 'Get current SOL balance (requires authentication)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_my_portfolio',
        description: 'Get portfolio holdings (requires authentication)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_my_positions',
        description: 'Get positions with P/L (requires authentication)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_my_total_pnl',
        description: 'Get total portfolio P/L (requires authentication)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'log_thought',
        description: 'Log AI trader thought process (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['message'],
        },
      },
      {
        name: 'get_simulation_time',
        description: 'Get current simulated timestamp (requires authentication)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'set_simulation_time',
        description: 'Set simulation time - resets portfolio (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            timestamp: { type: 'string' },
          },
          required: ['timestamp'],
        },
      },
      {
        name: 'set_playback_speed',
        description: 'Set playback speed (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            speed: { type: 'number' },
          },
          required: ['speed'],
        },
      },
      {
        name: 'request_faucet',
        description: 'Request SOL from faucet (requires authentication)',
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
          },
        },
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  // Get API key from environment or args
  const apiKey = process.env.MCP_API_KEY || (args as any)?.api_key
  let userId: string | null = null

  // Tools that require authentication
  const authRequiredTools = [
    'place_buy_order',
    'place_sell_order',
    'get_my_balance',
    'get_my_portfolio',
    'get_my_positions',
    'get_my_total_pnl',
    'log_thought',
    'get_simulation_time',
    'set_simulation_time',
    'set_playback_speed',
    'request_faucet',
  ]

  if (authRequiredTools.includes(name)) {
    if (!apiKey) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: API key required. Use mcp_register_user or mcp_login first.',
          },
        ],
        isError: true,
      }
    }

    userId = await getAuthenticatedUser(apiKey)
    if (!userId) {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: Invalid API key',
          },
        ],
        isError: true,
      }
    }
  }

  try {
    switch (name) {
      case 'mcp_register_user': {
        const { username, password } = args as { username: string; password: string }
        const existingUser = await prisma.user.findUnique({ where: { username } })
        if (existingUser) {
          return {
            content: [{ type: 'text', text: 'Error: Username already exists' }],
            isError: true,
          }
        }

        const passwordHash = await bcrypt.hash(password, 10)
        const user = await prisma.user.create({
          data: {
            username,
            passwordHash,
            role: 'user',
            isActive: true,
            isAiAgent: true,
          },
        })

        // Create API key
        const apiKeyValue = `mcp_${crypto.randomBytes(32).toString('hex')}`
        const apiKeyHash = crypto.createHash('sha256').update(apiKeyValue).digest('hex')

        await prisma.userApiKey.create({
          data: {
            userId: user.id,
            apiKeyHash,
            name: 'MCP API Key',
          },
        })

        // Initialize session
        await prisma.userSession.create({
          data: {
            userId: user.id,
            startTimestamp: BigInt(Date.now()),
            currentTimestamp: BigInt(Date.now()),
            playbackSpeed: 1.0,
            solBalanceStart: 10,
            isActive: true,
          },
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                api_key: apiKeyValue,
                user_id: user.id,
                message: 'Save this API key - it will not be shown again',
              }),
            },
          ],
        }
      }

      case 'mcp_login': {
        const { username, password } = args as { username: string; password: string }
        const user = await prisma.user.findUnique({ where: { username } })
        if (!user || !user.isActive) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid credentials' }],
            isError: true,
          }
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          return {
            content: [{ type: 'text', text: 'Error: Invalid credentials' }],
            isError: true,
          }
        }

        // Get or create API key
        let apiKeyRecord = await prisma.userApiKey.findFirst({
          where: { userId: user.id },
        })

        if (!apiKeyRecord) {
          const apiKeyValue = `mcp_${crypto.randomBytes(32).toString('hex')}`
          const apiKeyHash = crypto.createHash('sha256').update(apiKeyValue).digest('hex')

          apiKeyRecord = await prisma.userApiKey.create({
            data: {
              userId: user.id,
              apiKeyHash,
              name: 'MCP API Key',
            },
          })

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  api_key: apiKeyValue,
                  user_id: user.id,
                }),
              },
            ],
          }
        }

        // Return existing API key (in production, you'd need to store plaintext key separately or regenerate)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'API key already exists. Use the one you saved during registration.',
                user_id: user.id,
              }),
            },
          ],
        }
      }

      case 'get_token_info': {
        const { token_address } = args as { token_address: string }
        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
          include: { price: true },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: token.id,
                mintAddress: token.mintAddress,
                symbol: token.symbol,
                name: token.name,
                imageUri: token.imageUri,
                price: token.price
                  ? {
                      priceSol: Number(token.price.priceSol),
                      priceUsd: Number(token.price.priceUsd),
                    }
                  : null,
              }),
            },
          ],
        }
      }

      case 'get_token_price': {
        const { token_address, timestamp } = args as {
          token_address: string
          timestamp?: string
        }
        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
          include: { price: true },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        if (timestamp) {
          // Get price at specific time
          const trade = await prisma.trade.findFirst({
            where: {
              tokenId: token.id,
              timestamp: { lte: BigInt(timestamp) },
            },
            orderBy: { timestamp: 'desc' },
          })

          if (!trade) {
            return {
              content: [{ type: 'text', text: 'Error: No price data at that timestamp' }],
              isError: true,
            }
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  priceSol: Number(trade.priceSol),
                  priceUsd: Number(trade.amountUsd) / Number(trade.amountSol),
                  timestamp: trade.timestamp.toString(),
                }),
              },
            ],
          }
        }

        // Current price
        if (token.price) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  priceSol: Number(token.price.priceSol),
                  priceUsd: Number(token.price.priceUsd),
                }),
              },
            ],
          }
        }

        return {
          content: [{ type: 'text', text: 'Error: No price data available' }],
          isError: true,
        }
      }

      case 'place_buy_order': {
        const { token_address, amount_sol } = args as {
          token_address: string
          amount_sol: number
        }

        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        const result = await executeBuyOrder(userId!, token.id, amount_sol)

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error}` }],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                tokens_received: result.tokensReceived,
              }),
            },
          ],
        }
      }

      case 'place_sell_order': {
        const { token_address, amount_tokens } = args as {
          token_address: string
          amount_tokens: number
        }

        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        const result = await executeSellOrder(userId!, token.id, amount_tokens)

        if (!result.success) {
          return {
            content: [{ type: 'text', text: `Error: ${result.error}` }],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                sol_received: result.solReceived,
              }),
            },
          ],
        }
      }

      case 'get_my_balance': {
        const balance = await getUserBalance(userId!)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ balance }),
            },
          ],
        }
      }

      case 'get_my_portfolio': {
        const portfolio = await getUserPortfolio(userId!)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ portfolio }),
            },
          ],
        }
      }

      case 'get_my_positions': {
        const portfolio = await getUserPortfolio(userId!)
        const positions = portfolio.map((p) => {
          const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
          const costBasis = p.amount * p.avgBuyPrice
          const pnl = currentValue - costBasis
          return {
            token: p.token,
            amount: p.amount,
            avgBuyPrice: p.avgBuyPrice,
            currentValue,
            costBasis,
            pnl,
            pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
          }
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ positions }),
            },
          ],
        }
      }

      case 'get_my_total_pnl': {
        const portfolio = await getUserPortfolio(userId!)
        const totalPnL = portfolio.reduce((sum, p) => {
          const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
          const costBasis = p.amount * p.avgBuyPrice
          return sum + (currentValue - costBasis)
        }, 0)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ totalPnL }),
            },
          ],
        }
      }

      case 'log_thought': {
        const { message, metadata } = args as {
          message: string
          metadata?: any
        }

        const session = await prisma.userSession.findUnique({
          where: { userId: userId! },
        })

        if (!session) {
          return {
            content: [{ type: 'text', text: 'Error: No active simulation session' }],
            isError: true,
          }
        }

        await prisma.aiTraderLog.create({
          data: {
            userId: userId!,
            logType: 1, // thought
            message,
            metadata: metadata || {},
            timestamp: session.currentTimestamp,
          },
        })

        // Update last activity
        await prisma.aiTraderConfig.updateMany({
          where: { userId: userId! },
          data: { lastActivityAt: new Date() },
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true }),
            },
          ],
        }
      }

      case 'get_simulation_time': {
        const session = await prisma.userSession.findUnique({
          where: { userId: userId! },
          select: {
            currentTimestamp: true,
            startTimestamp: true,
            playbackSpeed: true,
            isActive: true,
          },
        })

        if (!session) {
          return {
            content: [{ type: 'text', text: 'Error: No active simulation session' }],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                currentTimestamp: session.currentTimestamp.toString(),
                startTimestamp: session.startTimestamp.toString(),
                playbackSpeed: Number(session.playbackSpeed),
                isActive: session.isActive,
              }),
            },
          ],
        }
      }

      case 'set_simulation_time': {
        const { timestamp } = args as { timestamp: string }

        // Reset simulation
        await prisma.userSession.upsert({
          where: { userId: userId! },
          update: {
            startTimestamp: BigInt(timestamp),
            currentTimestamp: BigInt(timestamp),
            solBalanceStart: 10,
            isActive: true,
            updatedAt: new Date(),
          },
          create: {
            userId: userId!,
            startTimestamp: BigInt(timestamp),
            currentTimestamp: BigInt(timestamp),
            playbackSpeed: 1.0,
            solBalanceStart: 10,
            isActive: true,
          },
        })

        // Reset portfolio
        await prisma.userPortfolio.deleteMany({
          where: { userId: userId! },
        })

        await prisma.userTrade.deleteMany({
          where: { userId: userId! },
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true }),
            },
          ],
        }
      }

      case 'set_playback_speed': {
        const { speed } = args as { speed: number }

        await prisma.userSession.update({
          where: { userId: userId! },
          data: {
            playbackSpeed: speed,
            updatedAt: new Date(),
          },
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true }),
            },
          ],
        }
      }

      case 'request_faucet': {
        const { amount } = args as { amount?: number }
        const requestAmount = amount || 5

        const session = await prisma.userSession.findUnique({
          where: { userId: userId! },
        })

        if (session) {
          await prisma.userSession.update({
            where: { userId: userId! },
            data: {
              solBalanceStart: session.solBalanceStart + requestAmount,
            },
          })
        } else {
          await prisma.userSession.create({
            data: {
              userId: userId!,
              startTimestamp: BigInt(Date.now()),
              currentTimestamp: BigInt(Date.now()),
              playbackSpeed: 1.0,
              solBalanceStart: 10 + requestAmount,
              isActive: true,
            },
          })
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                amount: requestAmount,
              }),
            },
          ],
        }
      }

      case 'get_token_trades': {
        const { token_address, limit, start_time, end_time } = args as {
          token_address: string
          limit?: number
          start_time?: string
          end_time?: string
        }

        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        const where: any = { tokenId: token.id }
        if (start_time) {
          where.timestamp = { ...where.timestamp, gte: BigInt(start_time) }
        }
        if (end_time) {
          where.timestamp = { ...where.timestamp, lte: BigInt(end_time) }
        }

        const trades = await prisma.trade.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: limit || 100,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                trades: trades.map((t) => ({
                  type: t.type === 1 ? 'buy' : 'sell',
                  amountSol: Number(t.amountSol),
                  amountUsd: Number(t.amountUsd),
                  priceSol: Number(t.priceSol),
                  timestamp: t.timestamp.toString(),
                })),
              }),
            },
          ],
        }
      }

      case 'get_market_activity': {
        const { token_address, period } = args as {
          token_address: string
          period: string
        }

        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        // Calculate period in milliseconds
        const periodMs: Record<string, number> = {
          '5m': 5 * 60 * 1000,
          '1h': 60 * 60 * 1000,
          '6h': 6 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
        }

        const now = Date.now()
        const startTime = BigInt(now - periodMs[period])

        const trades = await prisma.trade.findMany({
          where: {
            tokenId: token.id,
            timestamp: { gte: startTime },
          },
        })

        let buyVolume = 0
        let sellVolume = 0
        const uniqueTraders = new Set<string>()

        trades.forEach((trade) => {
          uniqueTraders.add(trade.userAddress)
          if (trade.type === 1) {
            buyVolume += Number(trade.amountUsd)
          } else {
            sellVolume += Number(trade.amountUsd)
          }
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                period,
                buyVolume,
                sellVolume,
                totalVolume: buyVolume + sellVolume,
                uniqueTraders: uniqueTraders.size,
                numTrades: trades.length,
              }),
            },
          ],
        }
      }

      case 'get_candles': {
        const { token_address, interval, start_time, end_time, limit } = args as {
          token_address: string
          interval: string
          start_time?: string
          end_time?: string
          limit?: number
        }

        const token = await prisma.token.findUnique({
          where: { mintAddress: token_address },
        })

        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: Token not found' }],
            isError: true,
          }
        }

        const intervalMinutes: Record<string, number> = {
          '1m': 1,
          '5m': 5,
          '1h': 60,
          '6h': 360,
          '24h': 1440,
        }

        const where: any = {
          tokenId: token.id,
          interval: intervalMinutes[interval],
        }

        if (start_time) {
          where.timestamp = { ...where.timestamp, gte: BigInt(start_time) }
        }
        if (end_time) {
          where.timestamp = { ...where.timestamp, lte: BigInt(end_time) }
        }

        const candles = await prisma.candle.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          take: limit || 100,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                candles: candles.map((c) => ({
                  timestamp: c.timestamp.toString(),
                  open: Number(c.open),
                  high: Number(c.high),
                  low: Number(c.low),
                  close: Number(c.close),
                  volume: Number(c.volume),
                })),
              }),
            },
          ],
        }
      }

      case 'search_tokens': {
        const { query, limit: limitArg } = args as {
          query: string
          limit?: number
        }

        const tokens = await prisma.token.findMany({
          where: {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { symbol: { contains: query, mode: 'insensitive' } },
            ],
          },
          include: { price: true },
          take: limitArg || 20,
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                tokens: tokens.map((t) => ({
                  id: t.id,
                  mintAddress: t.mintAddress,
                  symbol: t.symbol,
                  name: t.name,
                  price: t.price
                    ? {
                        priceSol: Number(t.price.priceSol),
                        priceUsd: Number(t.price.priceUsd),
                      }
                    : null,
                })),
              }),
            },
          ],
        }
      }

      // Add other tool handlers...
      default:
        return {
          content: [
            {
              type: 'text',
              text: `Error: Unknown tool ${name}`,
            },
          ],
          isError: true,
        }
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message || 'Unknown error'}`,
        },
      ],
      isError: true,
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Pump.fun Mock Trader MCP server running on stdio')
}

main().catch(console.error)

