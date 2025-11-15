import { PrismaClient } from '@prisma/client'

import {
  cleanupOldTrades,
  DEFAULT_TRADE_CLEANUP_INTERVAL_MS,
  TRADE_RETENTION_MS,
} from '@/lib/trade-retention'

const prisma = new PrismaClient()

const CLEANUP_INTERVAL_MS = DEFAULT_TRADE_CLEANUP_INTERVAL_MS
let cleanupTimer: NodeJS.Timeout | null = null

async function runCleanupCycle() {
  try {
    const result = await cleanupOldTrades(prisma)
    if (result.tradesDeleted > 0 || result.tradeTapeDeleted > 0) {
      console.log(
        `[trade-retention] Removed ${result.tradesDeleted} trades and ${result.tradeTapeDeleted} trade tape rows older than 1 hour`
      )
    } else {
      console.log('[trade-retention] No stale trades found')
    }
  } catch (error) {
    console.error('[trade-retention] Failed to cleanup old trades:', (error as Error).message)
  }
}

async function main() {
  console.log(
    `[trade-retention] Starting retention worker (retention window=${
      TRADE_RETENTION_MS / (60 * 1000)
    } minutes, interval=${CLEANUP_INTERVAL_MS / 1000} seconds)`
  )
  await runCleanupCycle()
  cleanupTimer = setInterval(() => {
    void runCleanupCycle()
  }, CLEANUP_INTERVAL_MS)
}

void main()

const shutdown = async () => {
  console.log('[trade-retention] Shutting down retention worker')
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }
  await prisma.$disconnect()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

