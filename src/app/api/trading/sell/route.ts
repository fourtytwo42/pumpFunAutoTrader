import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { submitSellOrder } from '@/lib/orders'
import { validateTrade } from '@/lib/risk-profiles'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { tokenId, amountTokens, limitPriceSol, slippageBps } = body || {}

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

    // Get token mint address for risk validation
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
      select: { mintAddress: true },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Risk validation for AI traders (sells check slippage but not daily spend)
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAiAgent: true },
    })

    if (user?.isAiAgent) {
      const validation = await validateTrade(session.user.id, {
        mintAddress: token.mintAddress,
        side: 'sell',
        amountUSD: 0, // Sells don't count toward daily spend
        slippageBps: slippageBps || 500,
      })

      if (!validation.valid) {
        return NextResponse.json(
          {
            error: 'Risk validation failed',
            reason: validation.reason,
            violations: validation.violations,
          },
          { status: 403 }
        )
      }
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

