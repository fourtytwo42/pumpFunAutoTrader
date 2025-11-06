import { NextRequest, NextResponse } from 'next/server'
import { getDashboardSnapshot } from '@/lib/dashboard'

export async function GET(request: NextRequest) {
  try {
    const walletId = request.nextUrl.searchParams.get('walletId') || undefined
    const snapshot = await getDashboardSnapshot(walletId)

    if (!snapshot) {
      return NextResponse.json({ error: 'Dashboard metrics unavailable' }, { status: 404 })
    }

    const { wallet, ...metrics } = snapshot

    return NextResponse.json({
      walletId: wallet.id,
      equityUsd: metrics.realizedUsd + metrics.unrealizedUsd,
      portfolioValueSol: metrics.portfolioValueSol,
      realizedUsd: metrics.realizedUsd,
      unrealizedUsd: metrics.unrealizedUsd,
      solUsd: metrics.solUsd,
      totalTrades: metrics.totalTrades,
      positions: wallet.positions.length,
      openOrders: metrics.openOrders,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Dashboard overview error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
