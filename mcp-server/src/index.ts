import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { prisma } from './db.js'
import { logger } from './logger.js'
import { TradeIngestor } from './core/ws/ingestor.js'
import { getRuntime } from './runtime.js'
import { Scheduler } from './services/scheduler.js'
import { listWatchlistMints } from './services/repository.js'
import {
  candles,
  discoverUniverse,
  execTrade,
  holdersSnapshot,
  marketActivity,
  poolState,
  portfolio,
  recentTrades,
  rulesEngine as rulesEngineTool,
  solPrice,
  tokenStats,
  watchlist,
} from './tools/index.js'
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
} from './tools/types.js'

const runtime = getRuntime()
const scheduler = new Scheduler()
const ingestor = new TradeIngestor(runtime.aggregator)

runtime.aggregator.on('stats', (snapshot) => {
  void runtime.rulesEngine.handleSnapshot(snapshot)
})

runtime.rulesEngine.on('trigger', (payload) => {
  logger.info({ payload }, 'Rule triggered')
})

await runtime.rulesEngine.start()
ingestor.start()

scheduler.register({
  id: 'watchlist-backfill',
  intervalMs: 30_000,
  handler: async () => {
    const mints = await listWatchlistMints()
    for (const mint of mints) {
      try {
        await Promise.all([
          candles({ mint, interval: '1h', limit: 120 }),
          holdersSnapshot({ mint }),
        ])
      } catch (error) {
        logger.warn({ mint, error }, 'Failed to refresh watchlist snapshot')
      }
    }
  },
})

const server = new Server(
  {
    name: 'pump-fun-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

type ToolHandler = (input: any, userId?: string | null) => Promise<unknown>

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: ToolHandler
  requiresAuth?: boolean
}

const toolCatalogue: ToolDefinition[] = [
  {
    name: 'mcp_register_user',
    description: 'Register a new operator and issue an API key',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
    handler: async (input: { username: string; password: string }) => registerUser(input),
  },
  {
    name: 'mcp_login',
    description: 'Login and retrieve API key',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
    handler: async (input: { username: string; password: string }) => loginUser(input),
  },
  {
    name: 'discoverUniverse',
    description: 'Fetch Pump.fun discovery list',
    inputSchema: {
      type: 'object',
      properties: {
        filters: { type: 'object' },
        limit: { type: 'number' },
      },
    },
    handler: (input: DiscoverUniverseInput) => discoverUniverse(input),
  },
  {
    name: 'tokenStats',
    description: 'Retrieve real-time token statistics',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' },
      },
      required: ['mint'],
    },
    handler: (input: TokenStatsInput) => tokenStats(input),
  },
  {
    name: 'recentTrades',
    description: 'On-demand trade history snapshot',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' },
        minSol: { type: 'number' },
        limit: { type: 'number' },
        cursor: { type: 'string' },
      },
      required: ['mint'],
    },
    handler: (input: RecentTradesInput) => recentTrades(input),
  },
  {
    name: 'holdersSnapshot',
    description: 'Holder concentration snapshot',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' },
        thresholdSol: { type: 'number' },
      },
      required: ['mint'],
    },
    handler: (input: HoldersSnapshotInput) => holdersSnapshot(input),
  },
  {
    name: 'marketActivity',
    description: 'Pool market-activity aggregates',
    inputSchema: {
      type: 'object',
      properties: {
        pool: { type: 'string' },
        windows: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['pool', 'windows'],
    },
    handler: (input: MarketActivityInput) => marketActivity(input),
  },
  {
    name: 'candles',
    description: 'Trend regime & volatility metrics',
    inputSchema: {
      type: 'object',
      properties: {
        mint: { type: 'string' },
        limit: { type: 'number' },
        interval: { type: 'string' },
      },
      required: ['mint'],
    },
    handler: (input: CandlesInput) => candles(input),
  },
  {
    name: 'solPrice',
    description: 'SOL/USD reference price',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: () => solPrice(),
  },
  {
    name: 'poolState',
    description: 'Fetch Solana accounts via getMultipleAccounts',
    inputSchema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['accounts'],
    },
    handler: (input: PoolStateInput) => poolState(input),
  },
  {
    name: 'watchlist',
    description: 'Manage watchlist entries',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string' },
        items: { type: 'array' },
      },
      required: ['op'],
    },
    handler: (input: WatchlistInput) => watchlist(input),
    requiresAuth: true,
  },
  {
    name: 'portfolio',
    description: 'Snapshot of agent portfolio',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string' },
      },
      required: ['op'],
    },
    handler: (input: PortfolioInput) => portfolio(input),
    requiresAuth: true,
  },
  {
    name: 'rulesEngine',
    description: 'Manage rules for automated alerts',
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string' },
        rules: { type: 'array' },
      },
      required: ['op'],
    },
    handler: (input: RulesEngineInput) => rulesEngineTool(input),
    requiresAuth: true,
  },
  {
    name: 'execTrade',
    description: 'Execute trade with slippage guard',
    inputSchema: {
      type: 'object',
      properties: {
        side: { type: 'string' },
        mint: { type: 'string' },
        amountSol: { type: 'number' },
        amountTokens: { type: 'number' },
        slippageBps: { type: 'number' },
        postOnly: { type: 'boolean' },
        clientId: { type: 'string' },
      },
      required: ['side', 'mint', 'slippageBps', 'clientId'],
    },
    handler: (input: ExecTradeInput) => execTrade(input),
    requiresAuth: true,
  },
]

const transport = new StdioServerTransport()
await server.connect(transport)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolCatalogue.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolCatalogue.find((t) => t.name === request.params.name)
  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Tool ${request.params.name} not found`,
        },
      ],
      isError: true,
    }
  }

  let args: any = {}
  let apiKeyOverride: string | undefined

  if (request.params.arguments) {
    try {
      args = JSON.parse(request.params.arguments)
      if (typeof args.apiKey === 'string') {
        apiKeyOverride = args.apiKey
        delete args.apiKey
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Invalid JSON arguments: ${(error as Error).message}`,
          },
        ],
        isError: true,
      }
    }
  }

  let userId: string | null = null
  if (tool.requiresAuth) {
    const apiKey = apiKeyOverride ?? request.params.apiKey
    userId = await getAuthenticatedUser(apiKey)
    if (!userId) {
      return {
        content: [
          {
            type: 'text',
            text: 'Authentication required',
          },
        ],
        isError: true,
      }
    }
  }

  try {
    const result = await tool.handler(args, userId)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    }
  } catch (error) {
    logger.error({ tool: tool.name, error }, 'Tool invocation failed')
    return {
      content: [
        {
          type: 'text',
          text: `Tool error: ${(error as Error).message}`,
        },
      ],
      isError: true,
    }
  }
})

async function registerUser(input: { username: string; password: string }) {
  const existing = await prisma.user.findUnique({
    where: { username: input.username },
  })
  if (existing) {
    throw new Error('Username already exists')
  }

  const passwordHash = await bcrypt.hash(input.password, 10)
  const user = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      isAiAgent: false,
      role: 'power_user',
    },
  })

  const apiKey = crypto.randomBytes(24).toString('hex')
  await prisma.userApiKey.create({
    data: {
      userId: user.id,
      apiKeyHash: apiKey,
      name: 'default',
    },
  })

  return { apiKey }
}

async function loginUser(input: { username: string; password: string }) {
  const user = await prisma.user.findUnique({
    where: { username: input.username },
  })

  if (!user) {
    throw new Error('Invalid credentials')
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash)
  if (!valid) {
    throw new Error('Invalid credentials')
  }

  const apiKey = crypto.randomBytes(24).toString('hex')
  await prisma.userApiKey.create({
    data: {
      userId: user.id,
      apiKeyHash: apiKey,
      name: 'session',
    },
  })

  return { apiKey }
}

async function getAuthenticatedUser(apiKey: string | undefined): Promise<string | null> {
  if (!apiKey) return null

  const key = await prisma.userApiKey.findFirst({
    where: { apiKeyHash: apiKey },
    include: { user: true },
  })

  if (!key || !key.user.isActive) {
    return null
  }

  await prisma.userApiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  })

  return key.userId
}
