import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

const LAMPORTS_PER_SOL = 1_000_000_000
const SUSPICIOUS_THRESHOLD = 1000 // Anything above 1000 SOL is likely lamports

async function fixLamportsTrades() {
  console.log('🔍 Searching for trades with suspiciously large amounts (likely stored as lamports)...')

  // Find trades with amount_sol > 1000 (likely lamports)
  const suspiciousTrades = await prisma.trade.findMany({
    where: {
      amountSol: {
        gt: SUSPICIOUS_THRESHOLD,
      },
    },
  })

  console.log(`📊 Found ${suspiciousTrades.length} trades with amounts > ${SUSPICIOUS_THRESHOLD} SOL`)

  if (suspiciousTrades.length === 0) {
    console.log('✅ No trades need fixing!')
    await prisma.$disconnect()
    return
  }

  console.log('🛠️  Fixing trades...')
  let fixedCount = 0

  for (const trade of suspiciousTrades) {
    try {
      // Convert lamports to SOL
      const amountSolLamports = new Decimal(trade.amountSol.toString())
      const amountSol = amountSolLamports.div(LAMPORTS_PER_SOL)

      // Recalculate priceSol
      // priceSol = amountSol / baseAmount (price per token in SOL)
      const baseAmount = new Decimal(trade.baseAmount.toString())
      let priceSol = baseAmount.gt(0) ? amountSol.div(baseAmount) : new Decimal(trade.priceSol.toString())
      
      // If priceSol is still suspiciously large, it might also be in wrong units
      // But usually priceSol is calculated correctly, so we'll keep it as is unless it's clearly wrong

      // Recalculate amountUsd using current SOL price
      let solPriceUsd = 160 // Fallback
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
        // Use fallback
      }

      const amountUsd = amountSol.mul(solPriceUsd)

      // Update the trade
      await prisma.trade.update({
        where: {
          id: trade.id,
        },
        data: {
          amountSol,
          amountUsd,
          priceSol,
        },
      })

      fixedCount++
      if (fixedCount % 100 === 0) {
        console.log(`✅ Fixed ${fixedCount}/${suspiciousTrades.length} trades...`)
      }
    } catch (error: any) {
      console.error(`❌ Error fixing trade ${trade.id}:`, error.message)
    }
  }

  console.log(`✅ Fixed ${fixedCount} trades!`)
  console.log('📊 Summary:')
  
  // Show summary
  const stats = await prisma.trade.aggregate({
    where: {
      amountSol: {
        gt: SUSPICIOUS_THRESHOLD,
      },
    },
    _count: true,
  })

  if (stats._count > 0) {
    console.log(`⚠️  Warning: ${stats._count} trades still have amounts > ${SUSPICIOUS_THRESHOLD} SOL`)
  } else {
    console.log('✅ All suspicious trades have been fixed!')
  }

  await prisma.$disconnect()
}

fixLamportsTrades().catch((error) => {
  console.error('❌ Fatal error:', error)
  process.exit(1)
})

