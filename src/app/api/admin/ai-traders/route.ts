import { NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { getUserBalance, getUserPortfolio } from '@/lib/trading'

export async function GET() {
  try {
    const session = await requireAdminOrPowerUser()

    // Get all AI agent users
    const aiUsers = await prisma.user.findMany({
      where: { isAiAgent: true },
      include: {
        aiConfig: true,
      },
    })

    // Get portfolio stats for each AI trader
    const traders = await Promise.all(
      aiUsers.map(async (user) => {
        const [balance, portfolio] = await Promise.all([
          getUserBalance(user.id),
          getUserPortfolio(user.id),
        ])

        const totalPnL = portfolio.reduce((sum, p) => {
          const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
          const costBasis = p.amount * p.avgBuyPrice
          return sum + (currentValue - costBasis)
        }, 0)

        return {
          id: user.id,
          username: user.username,
          configName: user.aiConfig?.configName || 'Unnamed',
          strategyType: user.aiConfig?.strategyType || 'unknown',
          isRunning: user.aiConfig?.isRunning || false,
          startedAt: user.aiConfig?.startedAt?.toISOString() || null,
          lastActivityAt: user.aiConfig?.lastActivityAt?.toISOString() || null,
          balance,
          totalPnL,
          positions: portfolio.length,
        }
      })
    )

    return NextResponse.json({ traders })
  } catch (error) {
    console.error('Get AI traders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

