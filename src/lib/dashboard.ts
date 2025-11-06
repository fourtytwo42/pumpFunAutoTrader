import { Prisma } from '@prisma/client'
import { prisma } from './db'
import { getLatestSolPrice, getTokenUsdPrice } from './metrics'
import { getOrCreateUserWallet } from './wallets'
import { getUserBalance } from './trading'

export async function getDefaultWallet(userId?: string) {
  try {
    if (userId) {
      const wallet = await prisma.wallet.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      })
      if (wallet) {
        return wallet
      }
      return await getOrCreateUserWallet(userId)
    }

    const wallet = await prisma.wallet.findFirst({
      orderBy: { createdAt: 'asc' },
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

export async function getDashboardSnapshot(userId: string, walletId?: string) {
  try {
    let wallet = null

    if (walletId) {
      try {
        wallet = await prisma.wallet.findUnique({
          where: { id: walletId, userId },
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
      wallet = await getDefaultWallet(userId)
    }

    if (!wallet) {
      return null
    }

    const portfolio = await prisma.userPortfolio.findMany({
      where: { userId },
      include: {
        token: {
          include: {
            price: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    })

    const solUsd = (await getLatestSolPrice()) ?? 0

    let portfolioValueSol = 0
    let portfolioValueUsd = 0
    let unrealizedUsd = 0

    const positions = await Promise.all(
      portfolio.map(async (position) => {
        const qty = Number(position.amount)
        const avgPriceSol = Number(position.avgBuyPrice)
        let priceSol = position.token.price ? Number(position.token.price.priceSol) : 0
        if (priceSol <= 0) {
          priceSol = (await getTokenUsdPrice(position.token.mintAddress)) ?? 0
          if (solUsd > 0) {
            priceSol = priceSol / solUsd
          }
        }
        const priceUsd = position.token.price
          ? Number(position.token.price.priceUsd)
          : priceSol * solUsd
        const mtmSol = priceSol * qty
        const mtmUsd = priceUsd * qty
        const costSol = avgPriceSol * qty
        const pnlSol = mtmSol - costSol
        const pnlUsd = pnlSol * solUsd
        unrealizedUsd += pnlUsd
        portfolioValueSol += mtmSol
        portfolioValueUsd += mtmUsd

        return {
          id: position.tokenId,
          tokenMint: position.token.mintAddress,
          token: {
            name: position.token.name,
            symbol: position.token.symbol,
            price: position.token.price
              ? {
                  priceSol,
                  priceUsd,
                }
              : null,
          },
          qty,
          avgPriceSol,
          priceSol,
          priceUsd,
          updatedAt: position.updatedAt,
        }
      })
    )

    const realizedUsdAgg = await prisma.pnLLedger.aggregate({
      _sum: { amountUsd: true },
      where: { walletId: wallet.id, type: { in: ['realized', 'fee'] } },
    })

    const realizedUsd = Number(realizedUsdAgg._sum.amountUsd ?? 0)

    const totalTrades = await prisma.tradeTape.count({
      where: { walletId: wallet.id },
    })

    const totalTokens = positions.length

    const openOrders = await prisma.order.count({
      where: {
        walletId: wallet.id,
        userId,
        status: {
          in: ['pending', 'open', 'accepted', 'queued'],
        },
      },
    })

    const balanceSol = await getUserBalance(userId)
    const balanceUsd = solUsd > 0 ? balanceSol * solUsd : 0
    const equityUsd = portfolioValueUsd + balanceUsd

    return {
      wallet,
      positions,
      solUsd,
      portfolioValueSol,
      portfolioValueUsd,
      realizedUsd,
      unrealizedUsd,
      equityUsd,
      balanceSol,
      balanceUsd,
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
