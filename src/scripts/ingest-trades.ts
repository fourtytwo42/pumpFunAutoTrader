import { PrismaClient } from '@prisma/client'
import { io } from 'socket.io-client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

// Pump.fun tokens use 6 decimal places (1 token = 1_000_000 base units)
const TOKEN_DECIMALS = new Decimal(1_000_000)

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
  virtual_sol_reserves?: number | string
  virtual_token_reserves?: number | string
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
    
    // Get SOL price for conversions (need this before price calculations)
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
    
    // Calculate price - use actual trade amounts for most accurate price
    // The trade amounts reflect the actual price paid, which is more accurate than reserves
    let priceSol: Decimal
    let priceUsdFromMarketCap: Decimal | null = null
    let calculationMethod = 'none'
    
    // First, try to calculate from actual trade amounts (most accurate - reflects real price paid)
    if (baseAmount.gt(0) && amountSol.gt(0)) {
      calculationMethod = 'trade_amounts'
      // Calculate: price per token = SOL spent / tokens received (convert base units to tokens)
      const baseAmountTokens = baseAmount.div(TOKEN_DECIMALS)
      console.log(`🔍 [${tradeData.symbol}] Price calculation from trade amounts:`)
      console.log(`   sol_amount (lamports): ${tradeData.sol_amount}`)
      console.log(`   amountSol: ${amountSol.toString()} SOL`)
      console.log(`   token_amount (raw): ${tradeData.token_amount}`)
      console.log(`   baseAmount (raw): ${baseAmount.toString()}`)
      console.log(`   baseAmountTokens (converted): ${baseAmountTokens.toString()}`)
      if (baseAmountTokens.gt(0)) {
        priceSol = amountSol.div(baseAmountTokens)
        const tokensPerSol = baseAmountTokens.div(amountSol)
        console.log(`   Tokens per SOL: ${tokensPerSol.toString()}`)
        console.log(`   Calculated priceSol: ${priceSol.toString()}`)
        console.log(`   SOL per 1M tokens: ${(Number(priceSol) * 1000000).toFixed(6)}`)
      } else {
        priceSol = new Decimal(0)
        console.log('   ⚠️ baseAmountTokens is zero after conversion')
      }
    } else if (tradeData.virtual_sol_reserves && tradeData.virtual_token_reserves) {
      calculationMethod = 'bonding_curve_reserves'
      const virtualSolReserves = new Decimal(tradeData.virtual_sol_reserves.toString()).div(LAMPORTS_PER_SOL) // Convert lamports to SOL
      const virtualTokenReserves = new Decimal(tradeData.virtual_token_reserves.toString())
      console.log(`🔍 [${tradeData.symbol}] Price calculation from bonding curve (fallback):`)
      console.log(`   virtual_sol_reserves (lamports): ${tradeData.virtual_sol_reserves}`)
      console.log(`   virtual_sol_reserves (SOL): ${virtualSolReserves.toString()}`)
      console.log(`   virtual_token_reserves: ${virtualTokenReserves.toString()}`)
      if (virtualTokenReserves.gt(0) && virtualSolReserves.gt(0)) {
        priceSol = virtualSolReserves.div(virtualTokenReserves)
        const tokensPerSol = virtualTokenReserves.div(virtualSolReserves)
        console.log(`   Calculated priceSol: ${priceSol.toString()}`)
        console.log(`   Tokens per SOL: ${tokensPerSol.toString()}`)
        console.log(`   SOL per 1M tokens: ${(Number(priceSol) * 1000000).toFixed(6)}`)
      } else {
        priceSol = new Decimal(0)
        console.log(`   ⚠️ Invalid reserves (SOL: ${virtualSolReserves.toString()}, Tokens: ${virtualTokenReserves.toString()})`)
      }
    } else if (tradeData.usd_market_cap && tradeData.total_supply) {
      calculationMethod = 'market_cap'
      // Fallback: calculate from market cap if available
      const totalSupply = new Decimal(tradeData.total_supply.toString())
      const marketCap = new Decimal(tradeData.usd_market_cap.toString())
      console.log(`🔍 [${tradeData.symbol}] Price calculation from market cap:`)
      console.log(`   usd_market_cap: ${marketCap.toString()}`)
      console.log(`   total_supply: ${totalSupply.toString()}`)
      if (totalSupply.gt(0)) {
        priceUsdFromMarketCap = marketCap.div(totalSupply)
        // Convert USD price to SOL price using current SOL price
        priceSol = priceUsdFromMarketCap.div(solPriceUsd)
        console.log(`   Calculated priceUsd: ${priceUsdFromMarketCap.toString()}`)
        console.log(`   Calculated priceSol: ${priceSol.toString()}`)
        console.log(`   SOL per 1M tokens: ${(Number(priceSol) * 1000000).toFixed(6)}`)
      } else {
        priceSol = new Decimal(0)
        console.log(`   ⚠️ Invalid total supply`)
      }
    } else if (tradeData.priceSol) {
      calculationMethod = 'provided_priceSol'
      priceSol = new Decimal(tradeData.priceSol)
      console.log(`🔍 [${tradeData.symbol}] Using provided priceSol: ${priceSol.toString()}`)
    } else {
      calculationMethod = 'trade_amounts'
      // Last resort: price = sol_amount / token_amount (not as accurate due to bonding curve)
      console.log(`🔍 [${tradeData.symbol}] Price calculation from trade amounts:`)
      console.log(`   sol_amount (lamports): ${tradeData.sol_amount}`)
      console.log(`   amountSol: ${amountSol.toString()}`)
      console.log(`   token_amount: ${tradeData.token_amount}`)
      console.log(`   baseAmount: ${baseAmount.toString()}`)
      priceSol = baseAmount.gt(0) ? amountSol.div(baseAmount) : new Decimal(0)
      console.log(`   Calculated priceSol: ${priceSol.toString()}`)
      console.log(`   SOL per 1M tokens: ${(Number(priceSol) * 1000000).toFixed(6)}`)
    }


    // Fallback: derive price from market cap if calculated price looks too small
    const totalSupplyRaw = new Decimal(tradeData.total_supply?.toString() || '0')
    const totalSupplyTokens = totalSupplyRaw.gt(0) ? totalSupplyRaw.div(TOKEN_DECIMALS) : new Decimal(0)

    let marketCapSol: Decimal | null = null
    if (tradeData.market_cap !== undefined && tradeData.market_cap !== null) {
      marketCapSol = new Decimal(tradeData.market_cap.toString())
    } else if (tradeData.usd_market_cap !== undefined && tradeData.usd_market_cap !== null) {
      marketCapSol = new Decimal(tradeData.usd_market_cap.toString()).div(solPriceUsd)
    }

    if ((priceSol.lte(0) || priceSol.lt(new Decimal('1e-9'))) && marketCapSol && totalSupplyTokens.gt(0)) {
      const priceSolFromMarketCap = marketCapSol.div(totalSupplyTokens)
      console.log(`🔄 [${tradeData.symbol}] Adjusting price using market cap: ${priceSolFromMarketCap.toString()} SOL/token`)
      priceSol = priceSolFromMarketCap
      priceUsdFromMarketCap = priceSol.mul(solPriceUsd)
      calculationMethod = 'market_cap_adjusted'
    }

    let priceUsd: Decimal
    // Prioritize priceUsd from market cap (already calculated above), then trade data, then SOL price calculation
    if (priceUsdFromMarketCap) {
      priceUsd = priceUsdFromMarketCap
    } else if (tradeData.priceUsd) {
      priceUsd = new Decimal(tradeData.priceUsd)
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

    const priceUsdNum = Number(priceUsd)
    const priceSolNum = Number(priceSol)
    const solPerMillion = priceSolNum * 1000000
    const usdPerMillion = priceUsdNum * 1000000
    console.log(`📊 [${tradeData.symbol}] Trade: ${tradeData.is_buy ? 'BUY' : 'SELL'}`)
    console.log(`   Amount: ${amountSol.toString()} SOL, ${baseAmount.toString()} tokens`)
    console.log(`   Price calculation method: ${calculationMethod}`)
    console.log(`   Price per token: ${priceSol.toString()} SOL = $${priceUsdNum.toFixed(12)} USD`)
    console.log(`   Per 1M tokens: ${solPerMillion.toFixed(6)} SOL = $${usdPerMillion.toFixed(2)} USD`)
    if (solPerMillion < 0.001 || usdPerMillion < 0.01) {
      console.log(`   ⚠️ WARNING: Price seems very low!`)
    }
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
