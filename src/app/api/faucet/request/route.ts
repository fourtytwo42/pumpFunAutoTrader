import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'

const MAX_AMOUNT = 10
const DEFAULT_AMOUNT = 5
const MAX_REQUESTS_PER_DAY = 10

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const { amount } = await request.json()

    const requestAmount = amount || DEFAULT_AMOUNT

    if (requestAmount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Maximum ${MAX_AMOUNT} SOL per request` },
        { status: 400 }
      )
    }

    if (requestAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      )
    }

    // Check daily request limit
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const recentRequests = await prisma.userTrade.findMany({
      where: {
        userId: session.user.id,
        type: 1, // Using buy type as a marker for faucet requests
        createdAt: {
          gte: today,
        },
      },
    })

    // For now, we'll use a simple approach - in production, you'd want a separate faucet_requests table
    // This is a simplified version using metadata
    const faucetRequests = recentRequests.filter((t) => {
      // Check if this is a faucet request (you'd store this differently in production)
      return Number(t.amountSol) === requestAmount && Number(t.priceSol) === 0
    })

    if (faucetRequests.length >= MAX_REQUESTS_PER_DAY) {
      return NextResponse.json(
        { error: `Maximum ${MAX_REQUESTS_PER_DAY} requests per day` },
        { status: 400 }
      )
    }

    // Add SOL to user's balance by updating their session's starting balance
    const session_data = await prisma.userSession.findUnique({
      where: { userId: session.user.id },
    })

    if (session_data) {
      await prisma.userSession.update({
        where: { userId: session.user.id },
        data: {
          solBalanceStart: session_data.solBalanceStart + requestAmount,
        },
      })
    } else {
      // Create session if it doesn't exist
      await prisma.userSession.create({
        data: {
          userId: session.user.id,
          startTimestamp: BigInt(Date.now()),
          currentTimestamp: BigInt(Date.now()),
          playbackSpeed: 1.0,
          solBalanceStart: 10 + requestAmount, // Default 10 + faucet amount
          isActive: true,
        },
      })
    }

    return NextResponse.json({
      success: true,
      amount: requestAmount,
      message: `Received ${requestAmount} SOL`,
    })
  } catch (error) {
    console.error('Faucet request error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

