/**
 * Backfill realized P/L for historical trades
 * This script calculates and records realized P/L for sell trades that occurred before we implemented P/L tracking
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfillRealizedPnL() {
  console.log('Starting realized P/L backfill...')

  // Get all users
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
  })

  for (const user of users) {
    console.log(`\nProcessing user: ${user.username}`)

    // Get user's wallet
    const wallet = await prisma.wallet.findFirst({
      where: { userId: user.id },
    })

    if (!wallet) {
      console.log(`  No wallet found, skipping`)
      continue
    }

    // Get all sell trades for this user
    const sellTrades = await prisma.userTrade.findMany({
      where: {
        userId: user.id,
        type: 2, // Sell
      },
      include: {
        token: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`  Found ${sellTrades.length} sell trades`)

    for (const trade of sellTrades) {
      // Check if we already have a P/L entry for this trade
      const existingEntry = await prisma.pnLLedger.findFirst({
        where: {
          walletId: wallet.id,
          tokenMint: trade.token.mintAddress,
          type: 'realized',
          meta: {
            path: ['timestamp'],
            equals: trade.simulatedTimestamp?.toString(),
          },
        },
      })

      if (existingEntry) {
        console.log(`  Trade ${trade.id} already has P/L entry, skipping`)
        continue
      }

      // Get the average buy price at the time of this sell
      // We need to look at all buy trades before this sell to calculate FIFO cost basis
      const priorBuyTrades = await prisma.userTrade.findMany({
        where: {
          userId: user.id,
          tokenId: trade.tokenId,
          type: 1, // Buy
          createdAt: { lt: trade.createdAt },
        },
        orderBy: { createdAt: 'asc' },
      })

      const priorSellTrades = await prisma.userTrade.findMany({
        where: {
          userId: user.id,
          tokenId: trade.tokenId,
          type: 2, // Sell
          createdAt: { lt: trade.createdAt },
        },
        orderBy: { createdAt: 'asc' },
      })

      // Calculate total bought and sold before this trade
      const totalBought = priorBuyTrades.reduce(
        (sum, t) => sum + Number(t.amountTokens),
        0
      )
      const totalSold = priorSellTrades.reduce((sum, t) => sum + Number(t.amountTokens), 0)
      const tokensHeldBefore = totalBought - totalSold

      if (tokensHeldBefore <= 0) {
        console.log(`  Trade ${trade.id}: No tokens held before sell, skipping`)
        continue
      }

      // Calculate weighted average cost basis
      const totalCostSol = priorBuyTrades.reduce(
        (sum, t) => sum + Number(t.amountSol),
        0
      )
      const avgBuyPriceSol = totalCostSol / totalBought

      // Calculate realized P/L for this sell
      const amountTokens = Number(trade.amountTokens)
      const sellPriceSol = Number(trade.priceSol)
      const solReceived = Number(trade.amountSol)
      const costBasisSol = amountTokens * avgBuyPriceSol
      const realizedPnlSol = solReceived - costBasisSol

      // Get SOL price at the time of the trade (approximate with current price)
      const latestSolPrice = await prisma.solPrice.findFirst({
        orderBy: { timestamp: 'desc' },
      })
      const solPriceUsd = latestSolPrice ? Number(latestSolPrice.priceUsd) : 0
      const realizedPnlUsd = realizedPnlSol * solPriceUsd

      console.log(
        `  Trade ${trade.id}: Sold ${amountTokens.toFixed(2)} tokens at ${sellPriceSol.toFixed(8)} SOL`
      )
      console.log(`    Avg buy price: ${avgBuyPriceSol.toFixed(8)} SOL`)
      console.log(`    Realized P/L: ${realizedPnlSol.toFixed(4)} SOL ($${realizedPnlUsd.toFixed(2)})`)

      // Create P/L ledger entry
      await prisma.pnLLedger.create({
        data: {
          walletId: wallet.id,
          tokenMint: trade.token.mintAddress,
          type: 'realized',
          amountUsd: realizedPnlUsd,
          meta: {
            amountTokens,
            sellPriceSol,
            avgBuyPriceSol,
            realizedPnlSol,
            timestamp: trade.simulatedTimestamp?.toString(),
            backfilled: true,
            tradeId: trade.id.toString(),
          },
        },
      })

      console.log(`    ✓ Created P/L ledger entry`)
    }
  }

  console.log('\n✓ Backfill complete!')
}

backfillRealizedPnL()
  .catch((error) => {
    console.error('Backfill failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

