import { PrismaClient } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()

const SOL_PRICE_API_URL = 'https://frontend-api-v3.pump.fun/sol-price'
const FETCH_INTERVAL_MS = 5 * 60 * 1000 // Fetch every 5 minutes

interface SolPriceResponse {
  solPrice: number
}

async function fetchSolPrice(): Promise<number | null> {
  try {
    const response = await fetch(SOL_PRICE_API_URL, {
      headers: {
        'Origin': 'https://pump.fun',
      },
    })

    if (!response.ok) {
      console.error(`❌ Failed to fetch SOL price: ${response.status} ${response.statusText}`)
      return null
    }

    const data: SolPriceResponse = await response.json()
    return data.solPrice
  } catch (error: any) {
    console.error('❌ Error fetching SOL price:', error.message)
    return null
  }
}

async function storeSolPrice(priceUsd: number) {
  try {
    const timestamp = BigInt(Date.now())

    await prisma.solPrice.create({
      data: {
        priceUsd: new Decimal(priceUsd),
        timestamp,
      },
    })

    console.log(`✅ Stored SOL price: $${priceUsd.toFixed(2)} at ${new Date().toISOString()}`)
  } catch (error: any) {
    console.error('❌ Error storing SOL price:', error.message)
  }
}

async function getLatestSolPrice(): Promise<number | null> {
  try {
    const latest = await prisma.solPrice.findFirst({
      orderBy: {
        timestamp: 'desc',
      },
    })

    return latest ? Number(latest.priceUsd) : null
  } catch (error: any) {
    console.error('❌ Error fetching latest SOL price:', error.message)
    return null
  }
}

async function startSolPriceFetching() {
  console.log('🚀 Starting SOL price fetching service...')
  
  // Fetch immediately on startup
  const initialPrice = await fetchSolPrice()
  if (initialPrice) {
    await storeSolPrice(initialPrice)
  } else {
    // If fetch fails, try to use latest from DB
    const latestPrice = await getLatestSolPrice()
    if (latestPrice) {
      console.log(`📊 Using latest SOL price from DB: $${latestPrice.toFixed(2)}`)
    } else {
      console.warn('⚠️ No SOL price available. Using fallback: $160.00')
    }
  }

  // Then fetch periodically
  setInterval(async () => {
    const price = await fetchSolPrice()
    if (price) {
      await storeSolPrice(price)
    }
  }, FETCH_INTERVAL_MS)

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('SIGINT received. Disconnecting from DB...')
    await prisma.$disconnect()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Disconnecting from DB...')
    await prisma.$disconnect()
    process.exit(0)
  })
}

startSolPriceFetching().catch((error) => {
  console.error('❌ Fatal error starting SOL price fetching:', error)
  process.exit(1)
})

