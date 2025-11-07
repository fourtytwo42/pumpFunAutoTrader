import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import WebSocket from 'ws'
import { decodePumpUnifiedTradePayload, normaliseMetadataUri, PumpUnifiedTrade } from '@/lib/pump/unified-trade'

const prisma = new PrismaClient()

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

// Batch inserts for efficiency
const TRADE_BATCH_SIZE = 100
const tradeBuffer: any[] = []
const metadataCache = new Map<string, Promise<TokenMetadata | null>>()
const FLUSH_INTERVAL = 5000 // 5 seconds

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

async function flushTradeBuffer() {
  if (tradeBuffer.length === 0) return

  const tradesToInsert = [...tradeBuffer]
  tradeBuffer.length = 0

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const trade of tradesToInsert) {
          await tx.trade.upsert({
            where: { txSignature: trade.txSignature },
            update: {},
            create: trade,
          })
        }
      },
      { timeout: 30000 }
    )

    console.log(`✅ Flushed ${tradesToInsert.length} trades to database`)
  } catch (error: any) {
    console.error('❌ Error flushing trades:', error.message)
    tradeBuffer.push(...tradesToInsert)
  }
}

setInterval(() => {
  void flushTradeBuffer()
}, FLUSH_INTERVAL)

async function getLatestSolPrice(): Promise<number> {
  try {
    const latestSolPrice = await prisma.solPrice.findFirst({
      orderBy: { timestamp: 'desc' },
    })
    if (latestSolPrice) {
      return Number(latestSolPrice.priceUsd)
    }
  } catch (error) {
    console.warn('[pump-feed] Failed to retrieve cached SOL price, falling back to default')
  }
  return 160
}

async function upsertTradeTape(trade: PumpUnifiedTrade, baseAmountTokens: Decimal, amountSol: Decimal, priceUsd: Decimal, priceSol: Decimal, timestampMs: number) {
  try {
    await prisma.tradeTape.upsert({
      where: { txSig: trade.tx },
      update: {},
      create: {
        tokenMint: trade.mintAddress,
        txSig: trade.tx,
        ts: new Date(timestampMs),
        isBuy: trade.type?.toLowerCase() === 'buy',
        baseAmount: baseAmountTokens,
        quoteSol: amountSol,
        priceUsd,
        priceSol,
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
    console.warn(`[pump-feed] Failed to upsert trade tape for ${trade.tx}:`, (error as Error).message)
  }
}

async function processTrade(trade: PumpUnifiedTrade) {
  try {
    if (!trade.mintAddress || !trade.tx || !trade.userAddress) {
      console.warn('[pump-feed] Missing required trade fields:', trade)
      return
    }

    const isBuy = trade.type?.toLowerCase() === 'buy'

    const amountSol = new Decimal(
      trade.amountSol?.toString() ?? trade.quoteAmount?.toString() ?? '0'
    ).toDecimalPlaces(9)
    const baseAmountTokens = new Decimal(trade.baseAmount?.toString() ?? '0').toDecimalPlaces(9)
    const baseAmountRaw = baseAmountTokens.mul(TOKEN_DECIMALS).toDecimalPlaces(0)

    if (amountSol.lte(0) || baseAmountTokens.lte(0)) {
      console.warn(`[pump-feed] Skipping trade ${trade.tx} with zero amounts`)
      return
    }

    const timestampMs = Number.isFinite(Date.parse(trade.timestamp))
      ? Date.parse(trade.timestamp)
      : Date.now()

    const solPriceUsd = await getLatestSolPrice()

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

    const updateData: any = {
      imageUri: metadata?.image ?? undefined,
      twitter: metadata?.twitter ?? undefined,
      telegram: metadata?.telegram ?? undefined,
      website: metadata?.website ?? undefined,
      price: {
        upsert: {
          create: {
            priceSol,
            priceUsd,
            lastTradeTimestamp: BigInt(timestampMs),
          },
          update: {
            priceSol,
            priceUsd,
            lastTradeTimestamp: BigInt(timestampMs),
          },
        },
      },
    }

    const token = await prisma.token.upsert({
      where: { mintAddress: trade.mintAddress },
      update: updateData,
      create: {
        mintAddress: trade.mintAddress,
        symbol: trade.coinMeta?.symbol ?? metadata?.symbol ?? 'UNKNOWN',
        name: trade.coinMeta?.name ?? metadata?.name ?? 'Unknown Token',
        imageUri: metadata?.image ?? null,
        twitter: metadata?.twitter ?? null,
        telegram: metadata?.telegram ?? null,
        website: metadata?.website ?? null,
        creatorAddress,
        createdAt: BigInt(createdTs),
        kingOfTheHillTimestamp: null,
        completed: false,
        totalSupply: TOTAL_SUPPLY_RAW,
        price: {
          create: {
            priceSol,
            priceUsd,
            lastTradeTimestamp: BigInt(timestampMs),
          },
        },
      },
      select: { id: true },
    })

    await upsertTradeTape(trade, baseAmountTokens, amountSol, priceUsd, priceSol, timestampMs)

    tradeBuffer.push({
      tokenId: token.id,
      txSignature: trade.tx,
      userAddress: trade.userAddress,
      type: isBuy ? 1 : 2,
      amountSol,
      amountUsd,
      baseAmount: baseAmountRaw,
      priceSol,
      timestamp: BigInt(timestampMs),
    })

    if (tradeBuffer.length >= TRADE_BATCH_SIZE) {
      await flushTradeBuffer()
    }

    console.log(
      `📊 [${trade.coinMeta?.symbol ?? '???'}] ${isBuy ? 'BUY' : 'SELL'} | ` +
        `${amountSol.toString()} SOL @ ${priceSol.toString()} SOL (${priceUsd.toString()} USD)`
    )
  } catch (error: any) {
    console.error('❌ Error processing trade:', error.message, error.stack)
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
      void processTrade(trade)
    }
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
  await flushTradeBuffer()
  ws?.close()
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down...')
  await flushTradeBuffer()
  ws?.close()
  await prisma.$disconnect()
  process.exit(0)
})
