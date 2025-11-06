import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from './db'
import { eventBus } from './events'
import { advanceSimulationSession } from './simulation'
import { getUserBalance, recordBuyFill, recordSellFill } from './trading'
import { getOrCreateUserWallet } from './wallets'

interface TokenWithPricing {
  id: string
  mintAddress: string
  price?: {
    priceSol: Decimal
  } | null
  tokenStat?: {
    px: Decimal | null
  } | null
}

function resolvePriceSol(token: TokenWithPricing): number | null {
  if (token.price?.priceSol) {
    return Number(token.price.priceSol)
  }
  if (token.tokenStat?.px) {
    return Number(token.tokenStat.px)
  }
  return null
}

export async function submitBuyOrder({
  userId,
  tokenId,
  amountSol,
  limitPriceSol,
}: {
  userId: string
  tokenId: string
  amountSol: number
  limitPriceSol?: number
}) {
  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: {
      price: true,
      tokenStat: { select: { px: true } },
    },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const currentPrice = resolvePriceSol(token)
  if (!currentPrice || currentPrice <= 0) {
    return { success: false, error: 'Token price not available' }
  }

  const session = await advanceSimulationSession(userId)
  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

  const balance = await getUserBalance(userId, undefined, session)
  if (balance < amountSol) {
    return { success: false, error: 'Insufficient SOL balance' }
  }

  if (limitPriceSol != null && limitPriceSol > 0 && currentPrice > limitPriceSol) {
    const wallet = await getOrCreateUserWallet(userId)
    const order = await createLimitBuyOrder(userId, token, amountSol, limitPriceSol, wallet.id)
    await matchOpenOrdersForToken(token, currentPrice)
    return {
      success: true,
      status: 'open' as const,
      orderId: order.id,
      walletId: wallet.id,
    }
  }

  const tokensReceived = await recordBuyFill({
    userId,
    tokenId,
    amountSol,
    priceSol: currentPrice,
    timestamp: session.currentTimestamp,
  })

  await matchOpenOrdersForToken(token, currentPrice)

  return {
    success: true,
    status: 'filled' as const,
    tokensReceived,
    fillPrice: currentPrice,
  }
}

export async function submitSellOrder({
  userId,
  tokenId,
  amountTokens,
  limitPriceSol,
}: {
  userId: string
  tokenId: string
  amountTokens: number
  limitPriceSol?: number
}) {
  const portfolio = await prisma.userPortfolio.findUnique({
    where: {
      userId_tokenId: {
        userId,
        tokenId,
      },
    },
  })

  if (!portfolio || Number(portfolio.amount) < amountTokens) {
    return { success: false, error: 'Insufficient token balance' }
  }

  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: {
      price: true,
      tokenStat: { select: { px: true } },
    },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const currentPrice = resolvePriceSol(token)
  if (!currentPrice || currentPrice <= 0) {
    return { success: false, error: 'Token price not available' }
  }

  if (limitPriceSol != null && limitPriceSol > 0 && currentPrice < limitPriceSol) {
    const wallet = await getOrCreateUserWallet(userId)
    const order = await createLimitSellOrder(userId, token, amountTokens, limitPriceSol, wallet.id)
    await matchOpenOrdersForToken(token, currentPrice)
    return {
      success: true,
      status: 'open' as const,
      orderId: order.id,
      walletId: wallet.id,
    }
  }

  const session = await advanceSimulationSession(userId)
  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

  const solReceived = await recordSellFill({
    userId,
    tokenId,
    amountTokens,
    priceSol: currentPrice,
    timestamp: session.currentTimestamp,
  })

  await matchOpenOrdersForToken(token, currentPrice)

  return {
    success: true,
    status: 'filled' as const,
    solReceived,
    fillPrice: currentPrice,
  }
}

export async function createLimitBuyOrder(
  userId: string,
  token: TokenWithPricing,
  amountSol: number,
  limitPriceSol: number,
  walletId?: string
) {
  const wallet = walletId
    ? await prisma.wallet.findUnique({ where: { id: walletId } })
    : await getOrCreateUserWallet(userId)
  if (!wallet) {
    throw new Error('Unable to locate wallet')
  }

  const order = await prisma.order.create({
    data: {
      walletId: wallet.id,
      userId,
      tokenMint: token.mintAddress,
      side: 'buy',
      status: 'open',
      qtySol: new Decimal(amountSol),
      limitPriceSol: new Decimal(limitPriceSol),
    },
  })

  eventBus.emitEvent({
    type: 'order:update',
    payload: { walletId: wallet.id, orderId: order.id, status: order.status },
  })

  return order
}

export async function createLimitSellOrder(
  userId: string,
  token: TokenWithPricing,
  amountTokens: number,
  limitPriceSol: number,
  walletId?: string
) {
  const wallet = walletId
    ? await prisma.wallet.findUnique({ where: { id: walletId } })
    : await getOrCreateUserWallet(userId)
  if (!wallet) {
    throw new Error('Unable to locate wallet')
  }

  const order = await prisma.order.create({
    data: {
      walletId: wallet.id,
      userId,
      tokenMint: token.mintAddress,
      side: 'sell',
      status: 'open',
      qtyTokens: new Decimal(amountTokens),
      limitPriceSol: new Decimal(limitPriceSol),
    },
  })

  eventBus.emitEvent({
    type: 'order:update',
    payload: { walletId: wallet.id, orderId: order.id, status: order.status },
  })

  return order
}

export async function matchOpenOrdersForToken(
  token: TokenWithPricing,
  priceOverride?: number
) {
  const currentPrice = priceOverride ?? resolvePriceSol(token)
  if (!currentPrice || currentPrice <= 0) return

  const orders = await prisma.order.findMany({
    where: {
      tokenMint: token.mintAddress,
      status: { in: ['open', 'pending'] },
      limitPriceSol: { not: null },
    },
    orderBy: { createdAt: 'asc' },
  })

  for (const order of orders) {
    if (!order.userId) continue
    const limitPrice = order.limitPriceSol ? Number(order.limitPriceSol) : null
    if (!limitPrice) continue

    if (order.side === 'buy') {
      if (currentPrice > limitPrice) continue
      const amountSol = order.qtySol ? Number(order.qtySol) : 0
      if (amountSol <= 0) continue

      const session = await advanceSimulationSession(order.userId ?? '')
      if (!session) continue

      const balance = await getUserBalance(order.userId, undefined, session)
      if (balance < amountSol) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            reason: 'Insufficient SOL balance',
          },
        })
        eventBus.emitEvent({
          type: 'order:update',
          payload: { walletId: order.walletId, orderId: order.id, status: 'cancelled' },
        })
        continue
      }

      const tokensReceived = await recordBuyFill({
        userId: order.userId,
        tokenId: token.id,
        amountSol,
        priceSol: currentPrice,
        timestamp: session.currentTimestamp,
        walletId: order.walletId,
      })

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'filled',
          reason: `Filled at ${currentPrice.toFixed(6)} SOL`,
          qtyTokens: new Decimal(tokensReceived),
        },
      })

      await prisma.execution.create({
        data: {
          orderId: order.id,
          fillQty: new Decimal(tokensReceived),
          costSol: new Decimal(amountSol),
          feeSol: new Decimal(0),
        },
      })

      eventBus.emitEvent({
        type: 'order:update',
        payload: { walletId: order.walletId, orderId: order.id, status: 'filled' },
      })
    } else {
      // sell
      if (currentPrice < limitPrice) continue
      const amountTokens = order.qtyTokens ? Number(order.qtyTokens) : 0
      if (amountTokens <= 0) continue

      const session = await advanceSimulationSession(order.userId ?? '')
      if (!session) continue

      let solReceived: number
      try {
        solReceived = await recordSellFill({
          userId: order.userId,
          tokenId: token.id,
          amountTokens,
          priceSol: currentPrice,
          timestamp: session.currentTimestamp,
          walletId: order.walletId,
        })
      } catch (error) {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            reason: 'Insufficient token balance',
          },
        })
        eventBus.emitEvent({
          type: 'order:update',
          payload: { walletId: order.walletId, orderId: order.id, status: 'cancelled' },
        })
        continue
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: 'filled',
          reason: `Filled at ${currentPrice.toFixed(6)} SOL`,
          qtySol: new Decimal(solReceived),
        },
      })

      await prisma.execution.create({
        data: {
          orderId: order.id,
          fillQty: new Decimal(amountTokens),
          costSol: new Decimal(solReceived),
          feeSol: new Decimal(0),
        },
      })

      eventBus.emitEvent({
        type: 'order:update',
        payload: { walletId: order.walletId, orderId: order.id, status: 'filled' },
      })
    }
  }
}

