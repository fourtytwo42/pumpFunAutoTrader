import { Prisma } from '@prisma/client'
import { prisma } from './db'

// In-memory cache for SOL price
let cachedSolPrice: { price: number; timestamp: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function getLatestSolPrice(): Promise<number | null> {
  const now = Date.now()

  // Return cached price if still valid
  if (cachedSolPrice && now - cachedSolPrice.timestamp < CACHE_TTL_MS) {
    return cachedSolPrice.price
  }

  try {
    // Fetch from CoinGecko API
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { cache: 'no-store' }
    )

    if (!response.ok) {
      console.error('Failed to fetch SOL price from CoinGecko:', response.statusText)
      // Return cached price if available, even if stale
      return cachedSolPrice?.price ?? null
    }

    const data = await response.json()
    const price = data?.solana?.usd

    if (typeof price === 'number' && price > 0) {
      // Update cache
      cachedSolPrice = { price, timestamp: now }
      console.log(`[SOL Price] Updated: $${price.toFixed(2)} (cached for 10 min)`)
      return price
    }

    console.error('Invalid SOL price data from CoinGecko:', data)
    return cachedSolPrice?.price ?? null
  } catch (error) {
    console.error('Error fetching SOL price:', error)
    // Return cached price if available, even if stale
    return cachedSolPrice?.price ?? null
  }
}

export async function getTokenUsdPrice(mint: string): Promise<number | null> {
  const stat = await prisma.tokenStat.findUnique({
    where: { mint },
  })

  if (!stat?.px) {
    return null
  }

  const solPrice = await getLatestSolPrice()
  if (!solPrice) {
    return null
  }

  return Number(stat.px) * solPrice
}

export function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value)
}
