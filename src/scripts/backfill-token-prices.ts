import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

async function backfillTokenPrices() {
  console.log('🔄 Backfilling token prices from latest trades...')

  // Get all tokens
  const tokens = await prisma.token.findMany({
    select: {
      id: true,
      symbol: true,
      mintAddress: true,
    },
  })

  console.log(`📊 Found ${tokens.length} tokens to process`)

  // Get SOL price for USD conversion
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
    console.warn('Using fallback SOL price: $160')
  }

  let updatedCount = 0
  let createdCount = 0

  for (const token of tokens) {
    try {
      // Get the most recent trade for this token
      const latestTrade = await prisma.trade.findFirst({
        where: {
          tokenId: token.id,
        },
        orderBy: {
          timestamp: 'desc',
        },
      })

      if (!latestTrade) {
        // No trades yet, skip
        continue
      }

      const priceSol = new Decimal(latestTrade.priceSol.toString())
      const priceUsd = priceSol.mul(solPriceUsd)

      // Check if price record exists
      const existingPrice = await prisma.tokenPrice.findUnique({
        where: {
          tokenId: token.id,
        },
      })

      if (existingPrice) {
        // Update existing price
        await prisma.tokenPrice.update({
          where: {
            tokenId: token.id,
          },
          data: {
            priceSol,
            priceUsd,
            lastTradeTimestamp: latestTrade.timestamp,
          },
        })
        updatedCount++
      } else {
        // Create new price record
        await prisma.tokenPrice.create({
          data: {
            tokenId: token.id,
            priceSol,
            priceUsd,
            lastTradeTimestamp: latestTrade.timestamp,
          },
        })
        createdCount++
      }
    } catch (error: any) {
      console.error(`❌ Error processing token ${token.symbol} (${token.mintAddress}):`, error.message)
    }
  }

  console.log(`✅ Backfill complete:`)
  console.log(`   - Created: ${createdCount} price records`)
  console.log(`   - Updated: ${updatedCount} price records`)
  console.log(`   - Skipped: ${tokens.length - createdCount - updatedCount} tokens (no trades)`)

  await prisma.$disconnect()
}

backfillTokenPrices().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

