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

    const positions = portfolio.map((position) => {
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

    return NextResponse.json({
      walletId: wallet.id,
      solUsd,
      balanceSol,
      balanceUsd,
      equityUsd,
      realizedUsd,
      unrealizedUsd,
      positions,
    })
  } catch (error) {
    console.error('Get portfolio error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
