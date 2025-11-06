import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLatestSolPrice } from '@/lib/metrics'
import { requireAuth } from '@/lib/middleware'
import { getUserBalance } from '@/lib/trading'

export async function GET() {
  const session = await requireAuth({ redirectOnFail: false })

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const [balanceSol, trades, solPrice] = await Promise.all([
    getUserBalance(userId),
    prisma.userTrade.findMany({
      where: { userId },
      include: {
        token: {
          select: {
            symbol: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    getLatestSolPrice(),
  ])

  const balanceUsd = solPrice ? balanceSol * solPrice : null

  const transactions = trades.map((trade) => ({
    id: trade.id.toString(),
    type: trade.type === 1 ? 'buy' : 'sell',
    amountSol: Number(trade.amountSol),
    amountTokens: Number(trade.amountTokens),
    tokenSymbol: trade.token?.symbol ?? '—',
    tokenName: trade.token?.name ?? 'Unknown token',
    priceSol: Number(trade.priceSol),
    timestamp: trade.createdAt.toISOString(),
  }))

  return NextResponse.json({
    balanceSol,
    balanceUsd,
    transactions,
  })
}

