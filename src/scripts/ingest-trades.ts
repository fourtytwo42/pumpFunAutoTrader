import { PrismaClient } from '@prisma/client'
import { io } from 'socket.io-client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

// WebSocket URL for pump.fun trade feed
const SOCKET_URL = 'wss://frontend-api-v3.pump.fun'
const ORIGIN = 'https://pump.fun'

interface TradeCreatedEvent {
  mint: string
  signature: string
  is_buy: boolean
  sol_amount: number | string
  token_amount: number | string
  user: string
  timestamp: number
  created_timestamp: number
  last_trade_timestamp: number
  
  // Token metadata (comes with trade)
  symbol: string
  name: string
  image_uri?: string | null
  description?: string
  twitter?: string | null
  telegram?: string | null
  website?: string | null
  creator: string
  total_supply: number | string
  
  // Price info
  priceSol?: string
  priceUsd?: string
  market_cap?: number
  usd_market_cap?: number
}

// Batch inserts for efficiency
const TRADE_BATCH_SIZE = 100
const tradeBuffer: any[] = []
let lastFlush = Date.now()
const FLUSH_INTERVAL = 5000 // 5 seconds

async function flushTradeBuffer() {
  if (tradeBuffer.length === 0) return

  const tradesToInsert = [...tradeBuffer]
  tradeBuffer.length = 0

  try {
    // Use transaction to insert all trades
    await prisma.$transaction(
      async (tx) => {
        for (const trade of tradesToInsert) {
          await tx.trade.upsert({
            where: { txSignature: trade.txSignature },
            update: {}, // Don't update existing trades
            create: trade,
          })
        }
      },
      { timeout: 30000 }
    )

    console.log(`✅ Flushed ${tradesToInsert.length} trades to database`)
  } catch (error: any) {
    console.error('❌ Error flushing trades:', error.message)
    // Re-queue failed trades (simple retry - could be improved)
    tradeBuffer.push(...tradesToInsert)
  }
}

// Periodic flush
setInterval(flushTradeBuffer, FLUSH_INTERVAL)

async function processTrade(tradeData: TradeCreatedEvent) {
  try {
    // Validate required fields
    if (!tradeData.mint || !tradeData.signature || !tradeData.symbol || !tradeData.name) {
      console.warn('⚠️ Skipping trade with missing required fields:', tradeData)
      return
    }

    // Convert amounts to proper decimals
    // sol_amount is in lamports (1 SOL = 1,000,000,000 lamports)
    const LAMPORTS_PER_SOL = 1_000_000_000
    const amountSolLamports = new Decimal(tradeData.sol_amount?.toString() || '0')
    const amountSol = amountSolLamports.div(LAMPORTS_PER_SOL)
    const baseAmount = new Decimal(tradeData.token_amount?.toString() || '0')
    const timestamp = BigInt((tradeData.timestamp || Date.now() / 1000) * 1000) // Convert to milliseconds
    
    // Calculate price if not provided
    let priceSol: Decimal
    if (tradeData.priceSol) {
      priceSol = new Decimal(tradeData.priceSol)
    } else {
      // price = sol_amount / token_amount
      priceSol = baseAmount.gt(0) ? amountSol.div(baseAmount) : new Decimal(0)
    }

    // Calculate USD price
    // Try to get SOL price from DB, fallback to estimated $160
    let solPriceUsd = 160
    try {
      const latestSolPrice = await prisma.solPrice.findFirst({
        orderBy: {
          timestamp: 'desc',
        },
      })
      if (latestSolPrice) {
        solPriceUsd = Number(latestSolPrice.priceUsd)
      }
    } catch (error) {
      // Use fallback if DB query fails
    }

    let priceUsd: Decimal
    // Prioritize priceUsd from trade data, then market cap calculation, then SOL price calculation
    if (tradeData.priceUsd) {
      priceUsd = new Decimal(tradeData.priceUsd)
    } else if (tradeData.usd_market_cap && tradeData.total_supply) {
      // Use market cap / total supply for more accurate price (this is the most reliable)
      const totalSupply = new Decimal(tradeData.total_supply.toString())
      const marketCap = new Decimal(tradeData.usd_market_cap.toString())
      priceUsd = totalSupply.gt(0) 
        ? marketCap.div(totalSupply)
        : new Decimal(0)
    } else {
      // Fallback: Calculate from SOL price: priceUsd = priceSol * solPriceUsd
      priceUsd = priceSol.mul(solPriceUsd)
    }
    
    // If priceUsd is still 0 or extremely small, recalculate from priceSol as last resort
    if (priceUsd.eq(0) || (priceUsd.lt(0.000000001) && priceSol.gt(0))) {
      priceUsd = priceSol.mul(solPriceUsd)
    }

    const amountUsd = amountSol.mul(priceUsd)

    // Upsert token metadata and get token ID (must await to avoid race condition)
    let token
    try {
      token = await prisma.token.upsert({
        where: { mintAddress: tradeData.mint },
        update: {
          // Update social links if provided
          twitter: tradeData.twitter || undefined,
          telegram: tradeData.telegram || undefined,
          website: tradeData.website || undefined,
          // Always update price info from the latest trade
          price: {
            upsert: {
              create: {
                priceSol,
                priceUsd,
                lastTradeTimestamp: BigInt((tradeData.last_trade_timestamp || tradeData.timestamp || Date.now() / 1000) * 1000),
              },
              update: {
                priceSol,
                priceUsd,
                lastTradeTimestamp: BigInt((tradeData.last_trade_timestamp || tradeData.timestamp || Date.now() / 1000) * 1000),
              },
            },
          },
        },
        create: {
          mintAddress: tradeData.mint,
          symbol: tradeData.symbol || 'UNKNOWN',
          name: tradeData.name || 'Unknown Token',
          imageUri: tradeData.image_uri || null,
          twitter: tradeData.twitter || null,
          telegram: tradeData.telegram || null,
          website: tradeData.website || null,
          creatorAddress: tradeData.creator || 'unknown',
          createdAt: BigInt((tradeData.created_timestamp || tradeData.timestamp || Date.now() / 1000) * 1000),
          totalSupply: new Decimal(tradeData.total_supply?.toString() || '0'),
          price: {
            create: {
              priceSol,
              priceUsd,
                lastTradeTimestamp: BigInt((tradeData.last_trade_timestamp || tradeData.timestamp || Date.now() / 1000) * 1000),
            },
          },
        },
        select: {
          id: true,
        },
      })
    } catch (error: any) {
      console.error(`❌ Error upserting token ${tradeData.mint}:`, error.message)
      // If token upsert fails, we can't create the trade
      return
    }

    // Validate trade data before adding to buffer
    if (!tradeData.user || amountSol.lte(0) || baseAmount.lte(0)) {
      console.warn(`⚠️ Skipping invalid trade: ${tradeData.signature}`)
      return
    }

    // Add trade to buffer
    tradeBuffer.push({
      tokenId: token.id,
      txSignature: tradeData.signature,
      userAddress: tradeData.user,
      type: tradeData.is_buy ? 1 : 2, // 1=buy, 2=sell
      amountSol,
      amountUsd,
      baseAmount,
      priceSol,
      timestamp,
    })

    // Flush if buffer is full
    if (tradeBuffer.length >= TRADE_BATCH_SIZE) {
      await flushTradeBuffer()
    }

    console.log(
      `📊 Trade: ${tradeData.is_buy ? 'BUY' : 'SELL'} ${tradeData.symbol} - ${amountSol.toString()} SOL @ ${priceSol.toString()}`
    )
  } catch (error: any) {
    console.error('❌ Error processing trade:', error.message, error.stack)
  }
}

async function startTradeIngestion() {
  console.log('🚀 Starting trade ingestion service...')
  console.log(`📡 Connecting to ${SOCKET_URL}...`)

  // Connect to Socket.IO
  const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    upgrade: true,
    rememberUpgrade: true,
    extraHeaders: {
      Origin: ORIGIN,
    },
  })

  socket.on('connect', () => {
    console.log('✅ Connected to pump.fun WebSocket')
    console.log('👂 Listening for trade events...')
  })

  socket.on('disconnect', (reason) => {
    console.error(`❌ Disconnected: ${reason}`)
    console.log('🔄 Attempting to reconnect...')
  })

  socket.on('connect_error', (error) => {
    console.error('❌ Connection error:', error.message)
  })

  // Listen for tradeCreated events
  socket.on('tradeCreated', async (data: TradeCreatedEvent) => {
    await processTrade(data)
  })

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...')
    await flushTradeBuffer()
    socket.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down...')
    await flushTradeBuffer()
    socket.disconnect()
    await prisma.$disconnect()
    process.exit(0)
  })
}

startTradeIngestion().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})
