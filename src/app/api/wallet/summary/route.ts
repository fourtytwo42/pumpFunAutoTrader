import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLatestSolPrice } from '@/lib/metrics'
import { requireAuth } from '@/lib/middleware'
import { getUserBalance } from '@/lib/trading'
import { getDefaultWallet } from '@/lib/dashboard'

export async function GET() {
  const session = await requireAuth({ redirectOnFail: false })

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const [wallet, balanceSol, trades, solPrice] = await Promise.all([
    getDefaultWallet(userId),
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

  if (!wallet) {
    const usdBalance = solPrice ? balanceSol * solPrice : 0
    return NextResponse.json({
      wallet: null,
      walletId: null,
      solBalance: balanceSol,
      usdBalance,
      balanceSol,
      balanceUsd: usdBalance,
      solUsdPrice: solPrice ?? 0,
      transactions: [],
    })
  }

  const balanceUsd = solPrice ? balanceSol * solPrice : 0

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
    walletId: wallet.id,
    wallet: {
      id: wallet.id,
      label: wallet.label,
      pubkey: wallet.pubkey,
    },
    solBalance: balanceSol,
    usdBalance: balanceUsd,
    balanceSol,
    balanceUsd,
    solUsdPrice: solPrice ?? 0,
    transactions,
  })
}

