import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { submitBuyOrder } from '@/lib/orders'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { tokenId, amountSol, limitPriceSol } = body || {}

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

    const result = await submitBuyOrder({
      userId: session.user.id,
      tokenId,
      amountSol,
      limitPriceSol,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Buy order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

