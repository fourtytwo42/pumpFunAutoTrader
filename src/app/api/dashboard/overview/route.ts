import { NextRequest, NextResponse } from 'next/server'
import { getDashboardSnapshot } from '@/lib/dashboard'
import { requireAuth } from '@/lib/middleware'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const walletId = request.nextUrl.searchParams.get('walletId') || undefined
    const snapshot = await getDashboardSnapshot(session.user.id, walletId)

    if (!snapshot) {
      return NextResponse.json({ error: 'Dashboard metrics unavailable' }, { status: 404 })
    }

    const { wallet, ...metrics } = snapshot

    return NextResponse.json({
      walletId: wallet.id,
      balanceSol: metrics.balanceSol,
      balanceUsd: metrics.balanceUsd,
      equityUsd: metrics.equityUsd,
      portfolioValueSol: metrics.portfolioValueSol,
      portfolioValueUsd: metrics.portfolioValueUsd,
      realizedUsd: metrics.realizedUsd,
      unrealizedUsd: metrics.unrealizedUsd,
      solUsd: metrics.solUsd,
      totalTrades: metrics.totalTrades,
      positions: snapshot.positions.length,
      openOrders: metrics.openOrders,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Dashboard overview error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
