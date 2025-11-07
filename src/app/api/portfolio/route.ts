import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLatestSolPrice } from '@/lib/metrics'
import { requireAuth } from '@/lib/middleware'
import { getDefaultWallet } from '@/lib/dashboard'
import { getUserBalance } from '@/lib/trading'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const walletId = searchParams.get('walletId') ?? undefined
    const wallet = walletId
      ? await prisma.wallet.findUnique({ where: { id: walletId, userId: session.user.id } })
      : await getDefaultWallet(session.user.id)

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const [portfolio, solUsd, balanceSol] = await Promise.all([
      prisma.userPortfolio.findMany({
        where: { userId: session.user.id },
        include: {
          token: {
            include: {
              price: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      getLatestSolPrice().then((value) => value ?? 0),
      getUserBalance(session.user.id),
    ])

    const positions = portfolio
      .filter((position) => Number(position.amount) > 0.000001) // Only show open positions (threshold to handle precision)
      .map((position) => {
        const qty = Number(position.amount)
        const avgPriceSol = Number(position.avgBuyPrice)
        const priceSol = position.token.price ? Number(position.token.price.priceSol) : 0
        const priceUsd = position.token.price ? Number(position.token.price.priceUsd) : priceSol * solUsd
        const mtmUsd = priceUsd * qty
        const costUsd = avgPriceSol * solUsd * qty
        const pnlUsd = mtmUsd - costUsd
        return {
          mint: position.token.mintAddress,
          symbol: position.token.symbol,
          qty,
          avgCostUsd: avgPriceSol * solUsd,
          priceUsd,
          mtmUsd,
          pnlUsd,
          pnlPct: costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0,
        }
      })

    const unrealizedUsd = positions.reduce((sum, pos) => sum + pos.pnlUsd, 0)

    const realizedLedger = await prisma.pnLLedger.aggregate({
      _sum: { amountUsd: true },
      where: {
        walletId: wallet.id,
        type: {
          in: ['realized', 'fee'],
        },
      },
    })

    const realizedUsd = Number(realizedLedger._sum.amountUsd ?? 0)
    const balanceUsd = solUsd > 0 ? balanceSol * solUsd : 0
    const mtmTotalUsd = positions.reduce((sum, pos) => sum + pos.mtmUsd, 0)
    const equityUsd = balanceUsd + mtmTotalUsd

    // Get trade history grouped by token
    const trades = await prisma.userTrade.findMany({
      where: { userId: session.user.id },
      include: {
        token: {
          select: {
            mintAddress: true,
            symbol: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Group trades by token to calculate per-token P/L
    const tradesByToken = trades.reduce((acc, trade) => {
      const mint = trade.token.mintAddress
      if (!acc[mint]) {
        acc[mint] = {
          mint,
          symbol: trade.token.symbol,
          name: trade.token.name,
          trades: [],
          totalBought: 0,
          totalSold: 0,
          totalCostSol: 0,
          totalRevenueSol: 0,
        }
      }
      acc[mint].trades.push(trade)
      if (trade.type === 1) {
        // Buy
        acc[mint].totalBought += Number(trade.amountTokens)
        acc[mint].totalCostSol += Number(trade.amountSol)
      } else {
        // Sell
        acc[mint].totalSold += Number(trade.amountTokens)
        acc[mint].totalRevenueSol += Number(trade.amountSol)
      }
      return acc
    }, {} as Record<string, any>)

    // Calculate P/L for each token
    const tradeHistory = Object.values(tradesByToken).map((tokenData: any) => {
      const remainingTokens = tokenData.totalBought - tokenData.totalSold
      const avgBuyPriceSol =
        tokenData.totalBought > 0 ? tokenData.totalCostSol / tokenData.totalBought : 0

      // Find current position if exists
      const currentPosition = positions.find((p) => p.mint === tokenData.mint)

      let realizedPnlUsd = 0
      let unrealizedPnlUsd = 0

      if (tokenData.totalSold > 0) {
        // Calculate realized P/L for sold tokens
        const soldCostBasis = tokenData.totalSold * avgBuyPriceSol
        const realizedPnlSol = tokenData.totalRevenueSol - soldCostBasis
        realizedPnlUsd = realizedPnlSol * solUsd
      }

      if (currentPosition) {
        // Unrealized P/L from current position
        unrealizedPnlUsd = currentPosition.pnlUsd
      }

      const totalPnlUsd = realizedPnlUsd + unrealizedPnlUsd

      return {
        mint: tokenData.mint,
        symbol: tokenData.symbol,
        name: tokenData.name,
        totalBought: tokenData.totalBought,
        totalSold: tokenData.totalSold,
        remainingTokens,
        avgBuyPriceSol,
        realizedPnlUsd,
        unrealizedPnlUsd,
        totalPnlUsd,
        tradeCount: tokenData.trades.length,
        lastTradeAt: tokenData.trades[0]?.createdAt,
      }
    })

    return NextResponse.json({
      walletId: wallet.id,
      solUsd,
      balanceSol,
      balanceUsd,
      equityUsd,
      realizedUsd,
      unrealizedUsd,
      positions,
      tradeHistory,
    })
  } catch (error) {
    console.error('Get portfolio error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
