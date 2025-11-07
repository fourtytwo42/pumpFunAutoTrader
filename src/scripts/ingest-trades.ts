import { Prisma, PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import WebSocket from 'ws'
import { decodePumpUnifiedTradePayload, normaliseMetadataUri, PumpUnifiedTrade } from '@/lib/pump/unified-trade'

function enforceConnectionLimit(url?: string): string | undefined {
  if (!url) return url

  try {
    const parsed = new URL(url)
    parsed.searchParams.set('connection_limit', parsed.searchParams.get('connection_limit') ?? '1')
    parsed.searchParams.set('pool_timeout', parsed.searchParams.get('pool_timeout') ?? '0')
    return parsed.toString()
  } catch {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}connection_limit=1&pool_timeout=0`
  }
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: enforceConnectionLimit(process.env.DATABASE_URL),
    },
  },
})

// Pump.fun tokens use 6 decimal places (1 token = 1_000_000 base units)
const TOKEN_DECIMALS = new Decimal(1_000_000)
const TOTAL_SUPPLY_RAW = new Decimal('1000000000000000') // 1B tokens * 1e6 base units

// Unified trade feed (NATS over WebSocket)
const NATS_URL = 'wss://unified-prod.nats.realtime.pump.fun/'
const NATS_HEADERS = {
  Origin: 'https://pump.fun',
  'User-Agent': 'pump-fun-ingester/1.0',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}
const NATS_CONNECT_PAYLOAD = {
  no_responders: true,
  protocol: 1,
  verbose: false,
  pedantic: false,
  user: 'subscriber',
  pass: 'OX745xvUbNQMuFqV',
  lang: 'nats.ws',
  version: '1.30.3',
  headers: true,
}
const SUBJECTS = ['unifiedTradeEvent.processed']

interface TokenMetadata {
  image?: string
  description?: string
  twitter?: string
  telegram?: string
  website?: string
  [key: string]: unknown
}

const metadataCache = new Map<string, Promise<TokenMetadata | null>>()
const tradeQueue: PumpUnifiedTrade[] = []
let isProcessingQueue = false

interface PreparedTradeContext {
  trade: PumpUnifiedTrade
  isBuy: boolean
  amountSol: Decimal
  amountUsd: Decimal
  baseAmountTokens: Decimal
  baseAmountRaw: Decimal
  timestampMs: number
  priceSol: Decimal
  priceUsd: Decimal
  metadata: TokenMetadata | null
  fallbackSymbol: string
  fallbackName: string
  creatorAddress: string
  createdTs: number
  logSymbol: string
}

async function fetchTokenMetadata(uri: string): Promise<TokenMetadata | null> {
  if (metadataCache.has(uri)) {
    return metadataCache.get(uri)!
  }

  const task = (async () => {
    try {
      const response = await fetch(uri, { headers: { accept: 'application/json' }, cache: 'no-store' })
      if (!response.ok) {
        console.warn(`[pump-feed] Metadata request failed (${response.status}) for ${uri}`)
        return null
      }
      const json = (await response.json()) as TokenMetadata
      return json
    } catch (error) {
      console.warn(`[pump-feed] Metadata fetch error for ${uri}:`, (error as Error).message)
      return null
    }
  })()

  metadataCache.set(uri, task)
  return task
}

let solPriceCache = {
  value: 160,
  updatedAt: 0,
}

async function getSolPriceUsd(): Promise<number> {
  const now = Date.now()
  if (now - solPriceCache.updatedAt < 60_000) {
    return solPriceCache.value
  }

  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { headers: { accept: 'application/json' } }
    )

    if (response.ok) {
      const data = (await response.json()) as { solana?: { usd?: number } }
      const price = data.solana?.usd
      if (typeof price === 'number' && Number.isFinite(price)) {
        solPriceCache = { value: price, updatedAt: now }
        return price
      }
    }
  } catch (error) {
    console.warn('[pump-feed] Failed to fetch SOL price from CoinGecko:', (error as Error).message)
  }

  return solPriceCache.value
}

async function prepareTradeContext(
  trade: PumpUnifiedTrade,
  solPriceUsd: number
): Promise<PreparedTradeContext | null> {
  if (!trade.mintAddress || !trade.tx || !trade.userAddress) {
    console.warn('[pump-feed] Missing required trade fields:', trade)
    return null
  }

  const isBuy = trade.type?.toLowerCase() === 'buy'

  const amountSol = new Decimal(
    trade.amountSol?.toString() ?? trade.quoteAmount?.toString() ?? '0'
  ).toDecimalPlaces(9)
  const baseAmountTokens = new Decimal(trade.baseAmount?.toString() ?? '0').toDecimalPlaces(9)
  const baseAmountRaw = baseAmountTokens.mul(TOKEN_DECIMALS).toDecimalPlaces(0)

  if (amountSol.lte(0) || baseAmountTokens.lte(0)) {
    console.warn(`[pump-feed] Skipping trade ${trade.tx} with zero amounts`)
    return null
  }

  const timestampMs = Number.isFinite(Date.parse(trade.timestamp))
    ? Date.parse(trade.timestamp)
    : Date.now()

  let priceSol = trade.priceSol
    ? new Decimal(trade.priceSol.toString())
    : trade.priceQuotePerBase
      ? new Decimal(trade.priceQuotePerBase.toString())
      : amountSol.div(baseAmountTokens)
  priceSol = priceSol.toDecimalPlaces(18)

  let priceUsd = trade.priceUsd
    ? new Decimal(trade.priceUsd.toString())
    : priceSol.mul(solPriceUsd)
  priceUsd = priceUsd.toDecimalPlaces(8)

  let amountUsd = trade.amountUsd
    ? new Decimal(trade.amountUsd.toString())
    : amountSol.mul(priceUsd)
  amountUsd = amountUsd.toDecimalPlaces(2)

  const metadataUri = normaliseMetadataUri(trade.coinMeta?.uri)
  const metadata = metadataUri ? await fetchTokenMetadata(metadataUri) : null

  const creatorAddress = trade.creatorAddress ?? trade.coinMeta?.creator ?? 'unknown'
  const createdTs = trade.coinMeta?.createdTs ?? timestampMs

  const symbolFromName = (name?: string | null) =>
    name ? name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase() : undefined

  const fallbackSymbol =
    trade.coinMeta?.symbol ??
    metadata?.symbol ??
    symbolFromName(trade.coinMeta?.name) ??
    symbolFromName(metadata?.name) ??
    (trade.mintAddress ? trade.mintAddress.slice(0, 6).toUpperCase() : 'TOKEN')

  const fallbackName =
    trade.coinMeta?.name ??
    metadata?.name ??
    fallbackSymbol ??
    trade.mintAddress ??
    'Unknown Token'

  const logSymbol =
    fallbackSymbol ??
    metadata?.symbol ??
    metadata?.name ??
    trade.coinMeta?.name ??
    (trade.mintAddress ? `${trade.mintAddress.slice(0, 4)}…` : 'UNKNOWN')

  return {
    trade,
    isBuy,
    amountSol,
    amountUsd,
    baseAmountTokens,
    baseAmountRaw,
    timestampMs,
    priceSol,
    priceUsd,
    metadata,
    fallbackSymbol,
    fallbackName,
    creatorAddress,
    createdTs,
    logSymbol,
  }
}

async function persistPreparedTrade(ctx: PreparedTradeContext): Promise<void> {
  const { trade } = ctx

  let token
  try {
    token = await prisma.token.upsert({
      where: { mintAddress: trade.mintAddress },
      update: {
        imageUri: ctx.metadata?.image ?? undefined,
        twitter: ctx.metadata?.twitter ?? undefined,
        telegram: ctx.metadata?.telegram ?? undefined,
        website: ctx.metadata?.website ?? undefined,
        symbol: ctx.fallbackSymbol,
        name: ctx.fallbackName,
        price: {
          upsert: {
            create: {
              priceSol: ctx.priceSol,
              priceUsd: ctx.priceUsd,
              lastTradeTimestamp: BigInt(ctx.timestampMs),
            },
            update: {
              priceSol: ctx.priceSol,
              priceUsd: ctx.priceUsd,
              lastTradeTimestamp: BigInt(ctx.timestampMs),
            },
          },
        },
      },
      create: {
        mintAddress: trade.mintAddress,
        symbol: ctx.fallbackSymbol,
        name: ctx.fallbackName,
        imageUri: ctx.metadata?.image ?? null,
        twitter: ctx.metadata?.twitter ?? null,
        telegram: ctx.metadata?.telegram ?? null,
        website: ctx.metadata?.website ?? null,
        creatorAddress: ctx.creatorAddress,
        createdAt: BigInt(ctx.createdTs),
        kingOfTheHillTimestamp: null,
        completed: false,
        totalSupply: TOTAL_SUPPLY_RAW,
        price: {
          create: {
            priceSol: ctx.priceSol,
            priceUsd: ctx.priceUsd,
            lastTradeTimestamp: BigInt(ctx.timestampMs),
          },
        },
      },
      select: { id: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      token = await prisma.token.update({
        where: { mintAddress: trade.mintAddress },
        data: {
          imageUri: ctx.metadata?.image ?? undefined,
          twitter: ctx.metadata?.twitter ?? undefined,
          telegram: ctx.metadata?.telegram ?? undefined,
          website: ctx.metadata?.website ?? undefined,
          symbol: ctx.fallbackSymbol,
          name: ctx.fallbackName,
          price: {
            upsert: {
              create: {
                priceSol: ctx.priceSol,
                priceUsd: ctx.priceUsd,
                lastTradeTimestamp: BigInt(ctx.timestampMs),
              },
              update: {
                priceSol: ctx.priceSol,
                priceUsd: ctx.priceUsd,
                lastTradeTimestamp: BigInt(ctx.timestampMs),
              },
            },
          },
        },
        select: { id: true },
      })
    } else {
      throw error
    }
  }

  try {
    await prisma.tradeTape.upsert({
      where: { txSig: trade.tx },
      update: {},
      create: {
        tokenMint: trade.mintAddress,
        txSig: trade.tx,
        ts: new Date(ctx.timestampMs),
        isBuy: ctx.isBuy,
        baseAmount: ctx.baseAmountTokens,
        quoteSol: ctx.amountSol,
        priceUsd: ctx.priceUsd,
        priceSol: ctx.priceSol,
        userAddress: trade.userAddress ?? null,
        slot: (() => {
          try {
            return trade.slotIndexId ? BigInt(trade.slotIndexId) : null
          } catch {
            return null
          }
        })(),
        raw: trade,
      },
    })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
      console.warn(`[pump-feed] Failed to store trade tape for ${trade.tx}:`, (error as Error).message)
    }
  }

  await prisma.trade.upsert({
    where: { txSignature: trade.tx },
    update: {},
    create: {
      tokenId: token.id,
      txSignature: trade.tx,
      userAddress: trade.userAddress,
      type: ctx.isBuy ? 1 : 2,
      amountSol: ctx.amountSol,
      amountUsd: ctx.amountUsd,
      baseAmount: ctx.baseAmountRaw,
      priceSol: ctx.priceSol,
      timestamp: BigInt(ctx.timestampMs),
    },
  })
}

async function processTradeBatch(batch: PumpUnifiedTrade[]): Promise<void> {
  if (batch.length === 0) return

  const solPriceUsd = await getSolPriceUsd()
  const prepared = (
    await Promise.all(batch.map((trade) => prepareTradeContext(trade, solPriceUsd)))
  ).filter(Boolean) as PreparedTradeContext[]

  if (prepared.length === 0) return

  for (const ctx of prepared) {
    try {
      await persistPreparedTrade(ctx)
      console.log(
        `📊 [${ctx.logSymbol}] ${ctx.isBuy ? 'BUY' : 'SELL'} | ` +
          `${ctx.amountSol.toString()} SOL @ ${ctx.priceSol.toString()} SOL (${ctx.priceUsd.toString()} USD)`
      )
    } catch (error) {
      console.error(`[pump-feed] Failed to persist trade ${ctx.trade.tx}:`, (error as Error).message)
    }
  }
}

let ws: WebSocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let messageBuffer = ''

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    console.log('[pump-feed] Reconnecting...')
    connectToFeed()
  }, 2000)
}

function handleMessageChunk(chunk: string) {
  messageBuffer += chunk

  while (messageBuffer.length > 0) {
    if (messageBuffer.startsWith('PING')) {
      ws?.send('PONG\r\n')
      const newline = messageBuffer.indexOf('\r\n')
      messageBuffer = newline === -1 ? '' : messageBuffer.slice(newline + 2)
      continue
    }

    if (messageBuffer.startsWith('PONG') || messageBuffer.startsWith('+OK')) {
      const newline = messageBuffer.indexOf('\r\n')
      messageBuffer = newline === -1 ? '' : messageBuffer.slice(newline + 2)
      continue
    }

    if (messageBuffer.startsWith('INFO')) {
      const newline = messageBuffer.indexOf('\r\n')
      if (newline === -1) return
      const infoPayload = messageBuffer.slice(0, newline)
      console.log('[pump-feed]', infoPayload)
      messageBuffer = messageBuffer.slice(newline + 2)
      continue
    }

    if (!messageBuffer.startsWith('MSG')) {
      const newline = messageBuffer.indexOf('\r\n')
      messageBuffer = newline === -1 ? '' : messageBuffer.slice(newline + 2)
      continue
    }

    const headerEnd = messageBuffer.indexOf('\r\n')
    if (headerEnd === -1) return
    const header = messageBuffer.slice(0, headerEnd)
    const parts = header.split(' ')
    if (parts.length < 4) {
      messageBuffer = messageBuffer.slice(headerEnd + 2)
      continue
    }
    const size = Number(parts[3])
    const totalLength = headerEnd + 2 + size + 2
    if (messageBuffer.length < totalLength) return

    const payload = messageBuffer.slice(headerEnd + 2, headerEnd + 2 + size)
    messageBuffer = messageBuffer.slice(totalLength)

    const trade = decodePumpUnifiedTradePayload(payload)
    if (trade) {
      tradeQueue.push(trade)
      void scheduleQueueProcessing()
    }
  }
}

async function scheduleQueueProcessing() {
  if (isProcessingQueue) return
  isProcessingQueue = true

  try {
    while (tradeQueue.length > 0) {
      const batch = tradeQueue.splice(0, 50)
      try {
        await processTradeBatch(batch)
      } catch (error) {
        console.error('❌ Error processing batch:', (error as Error).message)
        tradeQueue.unshift(...batch)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  } finally {
    isProcessingQueue = false
  }
}

function connectToFeed() {
  ws = new WebSocket(NATS_URL, { headers: NATS_HEADERS })

  ws.once('open', () => {
    console.log('✅ Connected to pump.fun unified trade feed')
    messageBuffer = ''
    ws?.send(`CONNECT ${JSON.stringify(NATS_CONNECT_PAYLOAD)}\r\n`)
    ws?.send('PING\r\n')
    SUBJECTS.forEach((subject, idx) => {
      const sid = `sub${idx}`
      ws?.send(`SUB ${subject} ${sid}\r\n`)
    })
  })

  ws.on('message', (data) => {
    handleMessageChunk(data.toString())
  })

  ws.on('close', (code) => {
    console.warn(`[pump-feed] Connection closed (${code})`)
    scheduleReconnect()
  })

  ws.on('error', (error) => {
    console.error('[pump-feed] websocket error:', (error as Error).message)
    ws?.close()
  })
}

console.log('🚀 Starting unified trade ingestion service...')
connectToFeed()

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...')
  ws?.close()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...')
  ws?.close()
  await prisma.$disconnect()
  process.exit(0)
})
