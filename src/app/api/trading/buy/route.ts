import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { executeBuyOrder } from '@/lib/trading'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const { tokenId, amountSol } = await request.json()

    if (!tokenId || !amountSol) {
      return NextResponse.json(
        { error: 'tokenId and amountSol are required' },
        { status: 400 }
      )
    }

    if (amountSol <= 0) {
      return NextResponse.json(
        { error: 'amountSol must be greater than 0' },
        { status: 400 }
      )
    }

    const result = await executeBuyOrder(session.user.id, tokenId, amountSol)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      tokensReceived: result.tokensReceived,
    })
  } catch (error) {
    console.error('Buy order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

