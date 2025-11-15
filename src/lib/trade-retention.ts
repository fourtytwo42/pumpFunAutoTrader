import type { PrismaClient } from '@prisma/client'

export const TRADE_RETENTION_MS = 60 * 60 * 1000 // 1 hour
export const DEFAULT_TRADE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface TradeCleanupResult {
  tradesDeleted: number
  tradeTapeDeleted: number
}

export async function cleanupOldTrades(prisma: PrismaClient): Promise<TradeCleanupResult> {
  const cutoffMs = Date.now() - TRADE_RETENTION_MS
  const cutoffBigInt = BigInt(cutoffMs)
  const cutoffDate = new Date(cutoffMs)

  const [tradeResult, tradeTapeResult] = await prisma.$transaction([
    prisma.trade.deleteMany({
      where: {
        timestamp: {
          lt: cutoffBigInt,
        },
      },
    }),
    prisma.tradeTape.deleteMany({
      where: {
        ts: {
          lt: cutoffDate,
        },
      },
    }),
  ])

  return {
    tradesDeleted: tradeResult.count,
    tradeTapeDeleted: tradeTapeResult.count,
  }
}


