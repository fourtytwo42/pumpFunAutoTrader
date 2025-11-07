/**
 * AI Trading Tools
 * Simplified tool implementations for AI agents using existing APIs
 */

export interface AITool {
  name: string
  description: string
  parameters: Record<string, any>
}

export const AI_TRADING_TOOLS: AITool[] = [
  {
    name: 'get_trending_tokens',
    description: 'Fetch trending tokens from pump.fun with market data, volume, and price movements.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of tokens to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'get_token_details',
    description: 'Get detailed information about a specific token including price, market cap, volume, and holder data.',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address',
        },
      },
      required: ['mintAddress'],
    },
  },
  {
    name: 'get_token_candles',
    description: 'Get OHLCV candle data for technical analysis.',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address',
        },
        interval: {
          type: 'string',
          description: 'Candle interval: 1m, 5m, 1h, 6h, 24h',
          enum: ['1m', '5m', '1h', '6h', '24h'],
        },
        limit: {
          type: 'number',
          description: 'Number of candles (default: 100)',
        },
      },
      required: ['mintAddress'],
    },
  },
  {
    name: 'get_portfolio',
    description: 'Get current portfolio positions and balances.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'User ID (defaults to current agent)',
        },
      },
    },
  },
  {
    name: 'execute_buy',
    description: 'Execute a buy order for a token.',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address',
        },
        amountSol: {
          type: 'number',
          description: 'Amount of SOL to spend',
        },
        limitPrice: {
          type: 'number',
          description: 'Optional limit price in SOL per token',
        },
      },
      required: ['mintAddress', 'amountSol'],
    },
  },
  {
    name: 'execute_sell',
    description: 'Execute a sell order for a token.',
    parameters: {
      type: 'object',
      properties: {
        mintAddress: {
          type: 'string',
          description: 'Token mint address',
        },
        amountTokens: {
          type: 'number',
          description: 'Amount of tokens to sell',
        },
        limitPrice: {
          type: 'number',
          description: 'Optional limit price in SOL per token',
        },
      },
      required: ['mintAddress', 'amountTokens'],
    },
  },
  {
    name: 'get_sol_price',
    description: 'Get current SOL/USD price.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
]

/**
 * Execute a tool call using existing API routes and direct DB access
 */
export async function executeAITool(
  toolName: string,
  args: any,
  userId: string
): Promise<any> {
  console.log(`[AI Tool] Executing: ${toolName}`, args)

  try {
    switch (toolName) {
      case 'get_trending_tokens': {
        const { prisma } = await import('@/lib/db')
        const tokens = await prisma.token.findMany({
          include: {
            price: true,
            tokenStat: true,
          },
          orderBy: { createdAt: 'desc' },
          take: args.limit || 20,
        })
        return {
          tokens: tokens.map((t) => ({
            mint: t.mintAddress,
            symbol: t.symbol,
            name: t.name,
            priceSol: t.price ? Number(t.price.priceSol) : 0,
            priceUsd: t.price ? Number(t.price.priceUsd) : 0,
          })),
        }
      }

      case 'get_token_details': {
        const { prisma } = await import('@/lib/db')
        const token = await prisma.token.findUnique({
          where: { mintAddress: args.mintAddress },
          include: {
            price: true,
            tokenStat: true,
          },
        })
        if (!token) throw new Error('Token not found')
        return {
          mint: token.mintAddress,
          symbol: token.symbol,
          name: token.name,
          priceSol: token.price ? Number(token.price.priceSol) : 0,
          priceUsd: token.price ? Number(token.price.priceUsd) : 0,
        }
      }

      case 'get_token_candles': {
        // This would need to call the pump.fun API or use stored data
        return { message: 'Candle data not yet implemented in tool executor' }
      }

      case 'get_portfolio': {
        const { getUserBalance, getUserPortfolio } = await import('@/lib/trading')
        const balance = await getUserBalance(userId)
        const portfolio = await getUserPortfolio(userId)
        return {
          solBalance: balance,
          positions: portfolio.map((p) => ({
            mint: p.token.mintAddress,
            symbol: p.token.symbol,
            amount: Number(p.amount),
            avgBuyPrice: Number(p.avgBuyPrice),
          })),
        }
      }

      case 'execute_buy':
      case 'execute_sell':
        return { message: 'Trade execution not yet implemented in tool executor - use manual trading for now' }

      case 'get_sol_price': {
        const { getLatestSolPrice } = await import('@/lib/metrics')
        const price = await getLatestSolPrice()
        return { solPriceUsd: price }
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  } catch (error: any) {
    console.error(`[AI Tool] Error executing ${toolName}:`, error)
    throw error
  }
}

