import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { submitSellOrder } from '@/lib/orders'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { tokenId, amountTokens, limitPriceSol } = body || {}

    if (!tokenId || !amountTokens) {
      return NextResponse.json(
        { error: 'tokenId and amountTokens are required' },
        { status: 400 }
      )
    }

    if (amountTokens <= 0) {
      return NextResponse.json(
        { error: 'amountTokens must be greater than 0' },
        { status: 400 }
      )
    }

    const result = await submitSellOrder({
      userId: session.user.id,
      tokenId,
      amountTokens,
      limitPriceSol,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Sell order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

