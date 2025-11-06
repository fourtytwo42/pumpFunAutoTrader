import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { getLatestSolPrice, getTokenUsdPrice } from './metrics'

export async function getDefaultWallet() {
  try {
    const wallet = await prisma.wallet.findFirst({
      include: {
        positions: true,
      },
    })
    return wallet
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      console.warn('Dashboard wallet lookup skipped: table missing', {
        code: error.code,
        meta: error.meta,
      })
      return null
    }

    console.error('Dashboard wallet lookup error:', error)
    return null
  }
}

export async function getDashboardSnapshot(walletId?: string) {
  try {
    let wallet = null

    if (walletId) {
      try {
        wallet = await prisma.wallet.findUnique({
          where: { id: walletId },
          include: {
            positions: true,
          },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
          console.warn('Dashboard wallet lookup skipped: table missing', {
            code: error.code,
            meta: error.meta,
          })
          return null
        }
        throw error
      }
    } else {
      wallet = await getDefaultWallet()
    }

    if (!wallet) {
      return null
    }

    const solUsd = (await getLatestSolPrice()) ?? 0

    let portfolioValueSol = 0
    let unrealizedUsd = 0

    for (const position of wallet.positions) {
      const priceUsd = (await getTokenUsdPrice(position.tokenMint)) ?? 0
      const qty = Number(position.qty)
      const avgCost = Number(position.avgCostUsd)
      const mtmUsd = qty * priceUsd
      const pnlUsd = mtmUsd - qty * avgCost
      unrealizedUsd += pnlUsd
      portfolioValueSol += mtmUsd / (solUsd || 1)
    }

    const realizedUsdAgg = await prisma.pnLLedger.aggregate({
      _sum: { amountUsd: true },
      where: { walletId: wallet.id, type: { in: ['realized', 'fee'] } },
    })

    const realizedUsd = Number(realizedUsdAgg._sum.amountUsd ?? 0)

    const totalTrades = await prisma.tradeTape.count({
      where: { walletId: wallet.id },
    })

    const totalTokens = await prisma.position.count({
      where: { walletId: wallet.id },
    })

    const openOrders = await prisma.order.count({
      where: {
        walletId: wallet.id,
        status: {
          in: ['pending', 'open', 'accepted', 'queued'],
        },
      },
    })

    return {
      wallet,
      solUsd,
      portfolioValueSol,
      realizedUsd,
      unrealizedUsd,
      totalTrades,
      totalTokens,
      openOrders,
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      console.warn('Dashboard snapshot unavailable: missing table', {
        code: error.code,
        meta: error.meta,
      })
      return null
    }

    console.error('Dashboard snapshot error:', error)
    return null
  }
}
