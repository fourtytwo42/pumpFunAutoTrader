import { Prisma } from '@prisma/client'
import { prisma } from './db'

export async function getLatestSolPrice(): Promise<number | null> {
  const price = await prisma.solPrice.findFirst({
    orderBy: { timestamp: 'desc' },
  })
  return price ? Number(price.priceUsd) : null
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
