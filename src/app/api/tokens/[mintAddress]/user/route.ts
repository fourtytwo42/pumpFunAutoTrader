import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getUserBalance } from '@/lib/trading'
import { getOrCreateUserWallet } from '@/lib/wallets'

const ACTIVE_ORDER_STATUSES = ['pending', 'open', 'accepted', 'queued']

export async function GET(
  _request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
      include: {
        price: true,
        tokenStat: {
          select: { px: true },
        },
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const [wallet, balanceSol, portfolioEntry, trades, openOrders, latestSolPrice] =
      await Promise.all([
        getOrCreateUserWallet(session.user.id),
        getUserBalance(session.user.id),
        prisma.userPortfolio.findUnique({
          where: {
            userId_tokenId: {
              userId: session.user.id,
              tokenId: token.id,
            },
          },
        }),
        prisma.userTrade.findMany({
          where: {
            userId: session.user.id,
            tokenId: token.id,
          },
          orderBy: { simulatedTimestamp: 'desc' },
          take: 50,
        }),
        prisma.order.findMany({
          where: {
            userId: session.user.id,
            tokenMint: params.mintAddress,
            status: { in: ACTIVE_ORDER_STATUSES },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.solPrice.findFirst({
          orderBy: { timestamp: 'desc' },
        }),
      ])

    const solPriceUsd = latestSolPrice ? Number(latestSolPrice.priceUsd) : 0
    const currentPriceSol = token.price?.priceSol
      ? Number(token.price.priceSol)
      : token.tokenStat?.px
        ? Number(token.tokenStat.px)
        : 0
    const currentPriceUsd =
      currentPriceSol > 0 && solPriceUsd > 0
        ? currentPriceSol * solPriceUsd
        : token.price?.priceUsd
          ? Number(token.price.priceUsd)
          : 0

    let positionSummary: any = null
    if (portfolioEntry) {
      const amountTokens = Number(portfolioEntry.amount)
      const avgPriceSol = Number(portfolioEntry.avgBuyPrice)
      const currentValueSol = currentPriceSol > 0 ? amountTokens * currentPriceSol : 0
      const costBasisSol = amountTokens * avgPriceSol
      const unrealizedSol = currentValueSol - costBasisSol
      const currentValueUsd = currentValueSol * solPriceUsd
      const costBasisUsd = costBasisSol * solPriceUsd
      const unrealizedUsd = currentValueUsd - costBasisUsd
      const pnlPct =
        costBasisSol > 0 ? ((currentValueSol - costBasisSol) / costBasisSol) * 100 : 0

      positionSummary = {
        amountTokens,
        avgPriceSol,
        avgPriceUsd: avgPriceSol * solPriceUsd,
        currentValueSol,
        currentValueUsd,
        costBasisSol,
        costBasisUsd,
        unrealizedSol,
        unrealizedUsd,
        pnlPct,
      }
    }

    const tradeHistory = trades.map((trade) => {
      const amountSol = Number(trade.amountSol)
      const amountTokens = Number(trade.amountTokens)
      const priceSol = Number(trade.priceSol)
      const tradePriceUsd =
        priceSol > 0 && solPriceUsd > 0 ? priceSol * solPriceUsd : currentPriceUsd
      const amountUsd =
        amountSol > 0 && solPriceUsd > 0 ? amountSol * solPriceUsd : amountSol * currentPriceUsd
      return {
        id: trade.id.toString(),
        type: trade.type === 1 ? 'buy' : 'sell',
        amountSol,
        amountTokens,
        priceSol,
        priceUsd: tradePriceUsd,
        amountUsd,
        timestamp: Number(trade.simulatedTimestamp),
      }
    })

    const activeOrders = openOrders.map((order) => ({
      id: order.id,
      side: order.side,
      status: order.status,
      qtyTokens: order.qtyTokens ? Number(order.qtyTokens) : null,
      qtySol: order.qtySol ? Number(order.qtySol) : null,
      limitPriceSol: order.limitPriceSol ? Number(order.limitPriceSol) : null,
      createdAt: order.createdAt.toISOString(),
    }))

    return NextResponse.json({
      walletId: wallet.id,
      solBalance: balanceSol,
      position: positionSummary,
      trades: tradeHistory,
      openOrders: activeOrders,
      currentPriceSol,
      currentPriceUsd,
      solPriceUsd,
    })
  } catch (error) {
    console.error('Get token user summary error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

