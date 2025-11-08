import type { UserSession } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from './db'
import { ensureTokensMetadata } from './pump/metadata-service'
import { advanceSimulationSession } from './simulation'
import { getLatestSolPrice } from './metrics'

export async function getUserBalance(
  userId: string,
  timestamp?: bigint,
  sessionOverride?: UserSession | null
): Promise<number> {
  const session =
    sessionOverride !== undefined ? sessionOverride : await advanceSimulationSession(userId)

  if (!session) {
    return 10.0 // Default starting balance
  }

  const simTime = timestamp ?? session.currentTimestamp

  // Calculate balance from trades
  const trades = await prisma.userTrade.findMany({
    where: {
      userId,
      simulatedTimestamp: {
        lte: simTime,
      },
    },
  })

  let balance = Number(session.solBalanceStart)

  for (const trade of trades) {
    if (trade.type === 1) {
      // Buy - subtract SOL
      balance -= Number(trade.amountSol)
    } else {
      // Sell - add SOL
      balance += Number(trade.amountSol)
    }
  }

  return balance
}

export async function getUserPortfolio(userId: string) {
  const portfolios = await prisma.userPortfolio.findMany({
    where: { userId },
    include: {
      token: {
        include: {
          price: true,
        },
      },
    },
  })

  const tokenMap = new Map<string, (typeof portfolios)[number]['token']>()
  for (const entry of portfolios) {
    if (entry.token) {
      tokenMap.set(entry.token.id, entry.token)
    }
  }
  if (tokenMap.size > 0) {
    await ensureTokensMetadata(prisma, Array.from(tokenMap.values()))
  }

  return portfolios.map((p) => ({
    tokenId: p.tokenId,
    token: {
      mintAddress: p.token.mintAddress,
      symbol: p.token.symbol,
      name: p.token.name,
      imageUri: p.token.imageUri,
      price: p.token.price
        ? {
            priceSol: Number(p.token.price.priceSol),
            priceUsd: Number(p.token.price.priceUsd),
          }
        : null,
    },
    amount: Number(p.amount),
    avgBuyPrice: Number(p.avgBuyPrice),
  }))
}

export async function getTokenPriceAtTime(
  tokenId: string,
  timestamp: bigint
): Promise<{ priceSol: number; priceUsd: number } | null> {
  // Get the most recent trade before or at this timestamp
  const trade = await prisma.trade.findFirst({
    where: {
      tokenId,
      timestamp: {
        lte: timestamp,
      },
    },
    orderBy: {
      timestamp: 'desc',
    },
  })

  if (!trade) {
    return null
  }

  return {
    priceSol: Number(trade.priceSol),
    priceUsd: Number(trade.amountUsd) / Number(trade.amountSol),
  }
}

export async function executeBuyOrder(
  userId: string,
  tokenId: string,
  amountSol: number
): Promise<{ success: boolean; error?: string; tokensReceived?: number }> {
  const session = await advanceSimulationSession(userId)

  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

  const balance = await getUserBalance(userId, undefined, session)
  if (balance < amountSol) {
    return { success: false, error: 'Insufficient SOL balance' }
  }

  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: {
      price: true,
      tokenStat: {
        select: { px: true },
      },
    },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const price = token.price
    ? Number(token.price.priceSol)
    : token.tokenStat?.px
      ? Number(token.tokenStat.px)
      : await getTokenPriceAtTime(tokenId, session.currentTimestamp).then((p) =>
          p ? p.priceSol : 0
        )

  if (price === 0) {
    return { success: false, error: 'Token price not available' }
  }

  const tokensReceived = await recordBuyFill({
    userId,
    tokenId,
    amountSol,
    priceSol: price,
    timestamp: session.currentTimestamp,
  })

  return { success: true, tokensReceived }
}

export async function executeSellOrder(
  userId: string,
  tokenId: string,
  amountTokens: number
): Promise<{ success: boolean; error?: string; solReceived?: number }> {
  const session = await advanceSimulationSession(userId)

  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: {
      price: true,
      tokenStat: {
        select: { px: true },
      },
    },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const price = token.price
    ? Number(token.price.priceSol)
    : token.tokenStat?.px
      ? Number(token.tokenStat.px)
      : await getTokenPriceAtTime(tokenId, session.currentTimestamp).then((p) =>
          p ? p.priceSol : 0
        )

  if (price === 0) {
    return { success: false, error: 'Token price not available' }
  }

  const solReceived = await recordSellFill({
    userId,
    tokenId,
    amountTokens,
    priceSol: price,
    timestamp: session.currentTimestamp,
  })

  return { success: true, solReceived }
}

interface BuyFillParams {
  userId: string
  tokenId: string
  amountSol: number
  priceSol: number
  timestamp: bigint
  walletId?: string
}

interface SellFillParams {
  userId: string
  tokenId: string
  amountTokens: number
  priceSol: number
  timestamp: bigint
  walletId?: string
}

export async function recordBuyFill({
  userId,
  tokenId,
  amountSol,
  priceSol,
  timestamp,
}: BuyFillParams): Promise<number> {
  const tokensReceived = amountSol / priceSol

  await prisma.userTrade.create({
    data: {
      userId,
      tokenId,
      type: 1,
      amountSol,
      amountTokens: tokensReceived,
      priceSol,
      simulatedTimestamp: timestamp,
    },
  })

  const existing = await prisma.userPortfolio.findUnique({
    where: {
      userId_tokenId: {
        userId,
        tokenId,
      },
    },
  })

  if (existing) {
    const newAmount = Number(existing.amount) + tokensReceived
    const newAvgPrice =
      (Number(existing.avgBuyPrice) * Number(existing.amount) + priceSol * tokensReceived) /
      newAmount

    await prisma.userPortfolio.update({
      where: {
        userId_tokenId: {
          userId,
          tokenId,
        },
      },
      data: {
        amount: newAmount,
        avgBuyPrice: newAvgPrice,
      },
    })
  } else {
    await prisma.userPortfolio.create({
      data: {
        userId,
        tokenId,
        amount: tokensReceived,
        avgBuyPrice: priceSol,
      },
    })
  }

  return tokensReceived
}

export async function recordSellFill({
  userId,
  tokenId,
  amountTokens,
  priceSol,
  timestamp,
}: SellFillParams): Promise<number> {
  const portfolio = await prisma.userPortfolio.findUnique({
    where: {
      userId_tokenId: {
        userId,
        tokenId,
      },
    },
    include: {
      token: true,
    },
  })

  if (!portfolio || Number(portfolio.amount) < amountTokens) {
    throw new Error('Insufficient token balance')
  }

  const solReceived = amountTokens * priceSol
  const avgBuyPriceSol = Number(portfolio.avgBuyPrice)
  const costBasisSol = amountTokens * avgBuyPriceSol
  const realizedPnlSol = solReceived - costBasisSol

  // Get SOL price in USD for realized P/L calculation
  const solPriceUsd = (await getLatestSolPrice()) ?? 0
  const realizedPnlUsd = realizedPnlSol * solPriceUsd

  // Get user's wallet
  const wallet = await prisma.wallet.findFirst({
    where: { userId },
  })

  if (!wallet) {
    throw new Error('Wallet not found')
  }

  await prisma.$transaction([
    // Record the trade
    prisma.userTrade.create({
      data: {
        userId,
        tokenId,
        type: 2,
        amountSol: solReceived,
        amountTokens,
        priceSol,
        simulatedTimestamp: timestamp,
      },
    }),
    // Record realized P/L in ledger
    prisma.pnLLedger.create({
      data: {
        walletId: wallet.id,
        tokenMint: portfolio.token.mintAddress,
        type: 'realized',
        amountUsd: realizedPnlUsd,
        meta: {
          amountTokens,
          sellPriceSol: priceSol,
          avgBuyPriceSol,
          realizedPnlSol,
          timestamp: timestamp.toString(),
        },
      },
    }),
  ])

  const newAmount = Number(portfolio.amount) - amountTokens
  if (newAmount <= 0) {
    await prisma.userPortfolio.delete({
      where: {
        userId_tokenId: {
          userId,
          tokenId,
        },
      },
    })
  } else {
    await prisma.userPortfolio.update({
      where: {
        userId_tokenId: {
          userId,
          tokenId,
        },
      },
      data: {
        amount: newAmount,
      },
    })
  }

  return solReceived
}
