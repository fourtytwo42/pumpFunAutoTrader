import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { getUserPortfolio, getUserBalance } from '@/lib/trading'

export async function GET() {
  try {
    const session = await requireAuth()
    const [portfolio, balance] = await Promise.all([
      getUserPortfolio(session.user.id),
      getUserBalance(session.user.id),
    ])

    // Calculate total P/L
    let totalPnL = 0
    const positions = portfolio.map((p) => {
      const currentValue = p.token.price
        ? p.amount * p.token.price.priceSol
        : 0
      const costBasis = p.amount * p.avgBuyPrice
      const pnl = currentValue - costBasis
      totalPnL += pnl

      return {
        ...p,
        currentValue,
        costBasis,
        pnl,
        pnlPercent: costBasis > 0 ? (pnl / costBasis) * 100 : 0,
      }
    })

    return NextResponse.json({
      balance,
      portfolio: positions,
      totalPnL,
    })
  } catch (error) {
    console.error('Get portfolio error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

