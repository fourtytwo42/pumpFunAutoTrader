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
 * Execute a tool call using existing API routes
 */
export async function executeAITool(
  toolName: string,
  args: any,
  userId: string
): Promise<any> {
  console.log(`[AI Tool] Executing: ${toolName}`, args)

  try {
    switch (toolName) {
      case 'get_trending_tokens':
        const tokensRes = await fetch(`/api/tokens?limit=${args.limit || 20}`)
        return await tokensRes.json()

      case 'get_token_details':
        const detailsRes = await fetch(`/api/tokens/${args.mintAddress}`)
        return await detailsRes.json()

      case 'get_token_candles':
        const candlesRes = await fetch(
          `/api/tokens/${args.mintAddress}/candles?interval=${args.interval || '1h'}&limit=${args.limit || 100}`
        )
        return await candlesRes.json()

      case 'get_portfolio':
        const portfolioRes = await fetch(`/api/portfolio?userId=${args.userId || userId}`)
        return await portfolioRes.json()

      case 'execute_buy':
        const buyRes = await fetch(`/api/trading/buy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintAddress: args.mintAddress,
            amountSol: args.amountSol,
            limitPriceSol: args.limitPrice,
            userId,
          }),
        })
        return await buyRes.json()

      case 'execute_sell':
        const sellRes = await fetch(`/api/trading/sell`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mintAddress: args.mintAddress,
            amountTokens: args.amountTokens,
            limitPriceSol: args.limitPrice,
            userId,
          }),
        })
        return await sellRes.json()

      case 'get_sol_price':
        const { getLatestSolPrice } = await import('@/lib/metrics')
        const price = await getLatestSolPrice()
        return { solPriceUsd: price }

      default:
        throw new Error(`Unknown tool: ${toolName}`)
    }
  } catch (error: any) {
    console.error(`[AI Tool] Error executing ${toolName}:`, error)
    throw error
  }
}

