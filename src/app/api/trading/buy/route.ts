import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { submitBuyOrder } from '@/lib/orders'
import { validateTrade } from '@/lib/risk-profiles'
import { getSolPrice } from '@/lib/pump-api'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { tokenId, amountSol, limitPriceSol, slippageBps } = body || {}

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

    // Get token mint address for risk validation
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
      select: { mintAddress: true },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Risk validation for AI traders
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAiAgent: true },
    })

    if (user?.isAiAgent) {
      const solPrice = await getSolPrice()
      const amountUSD = amountSol * (solPrice?.solUsd || 0)

      const validation = await validateTrade(session.user.id, {
        mintAddress: token.mintAddress,
        side: 'buy',
        amountUSD,
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

