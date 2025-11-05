import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { executeSellOrder } from '@/lib/trading'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const { tokenId, amountTokens } = await request.json()

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

    const result = await executeSellOrder(session.user.id, tokenId, amountTokens)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      solReceived: result.solReceived,
    })
  } catch (error) {
    console.error('Sell order error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

