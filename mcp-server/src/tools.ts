import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getUserBalance(userId: string): Promise<number> {
  const session = await prisma.userSession.findUnique({
    where: { userId },
  })

  if (!session) {
    return 10.0
  }

  const trades = await prisma.userTrade.findMany({
    where: {
      userId,
      simulatedTimestamp: {
        lte: session.currentTimestamp,
      },
    },
  })

  let balance = Number(session.solBalanceStart)
  for (const trade of trades) {
    if (trade.type === 1) {
      balance -= Number(trade.amountSol)
    } else {
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

  return portfolios.map((p) => ({
    tokenId: p.tokenId,
    token: {
      mintAddress: p.token.mintAddress,
      symbol: p.token.symbol,
      name: p.token.name,
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
  const session = await prisma.userSession.findUnique({
    where: { userId },
  })

  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

  const balance = await getUserBalance(userId)
  if (balance < amountSol) {
    return { success: false, error: 'Insufficient SOL balance' }
  }

  const token = await prisma.token.findUnique({
    where: { id: tokenId },
    include: { price: true },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const price = token.price
    ? Number(token.price.priceSol)
    : await getTokenPriceAtTime(tokenId, session.currentTimestamp).then((p) =>
        p ? p.priceSol : 0
      )

  if (price === 0) {
    return { success: false, error: 'Token price not available' }
  }

  const tokensReceived = amountSol / price

  await prisma.userTrade.create({
    data: {
      userId,
      tokenId,
      type: 1,
      amountSol,
      amountTokens: tokensReceived,
      priceSol: price,
      simulatedTimestamp: session.currentTimestamp,
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
      (Number(existing.avgBuyPrice) * Number(existing.amount) + price * tokensReceived) /
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
        avgBuyPrice: price,
      },
    })
  }

  return { success: true, tokensReceived }
}

export async function executeSellOrder(
  userId: string,
  tokenId: string,
  amountTokens: number
): Promise<{ success: boolean; error?: string; solReceived?: number }> {
  const session = await prisma.userSession.findUnique({
    where: { userId },
  })

  if (!session) {
    return { success: false, error: 'No active simulation session' }
  }

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
    include: { price: true },
  })

  if (!token) {
    return { success: false, error: 'Token not found' }
  }

  const price = token.price
    ? Number(token.price.priceSol)
    : await getTokenPriceAtTime(tokenId, session.currentTimestamp).then((p) =>
        p ? p.priceSol : 0
      )

  if (price === 0) {
    return { success: false, error: 'Token price not available' }
  }

  const solReceived = amountTokens * price

  await prisma.userTrade.create({
    data: {
      userId,
      tokenId,
      type: 2,
      amountSol: solReceived,
      amountTokens,
      priceSol: price,
      simulatedTimestamp: session.currentTimestamp,
    },
  })

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

  return { success: true, solReceived }
}

