import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { getUserBalance, getUserPortfolio } from '@/lib/trading'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrPowerUser()

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      include: {
        aiConfig: true,
        trades: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { token: true },
        },
        aiLogs: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
      },
    })

    if (!user || !user.isAiAgent) {
      return NextResponse.json({ error: 'AI trader not found' }, { status: 404 })
    }

    const [balance, portfolio] = await Promise.all([
      getUserBalance(user.id),
      getUserPortfolio(user.id),
    ])

    const totalPnL = portfolio.reduce((sum, p) => {
      const currentValue = p.token.price ? p.amount * p.token.price.priceSol : 0
      const costBasis = p.amount * p.avgBuyPrice
      return sum + (currentValue - costBasis)
    }, 0)

    return NextResponse.json({
      id: user.id,
      username: user.username,
      configName: user.aiConfig?.configName || 'Unnamed',
      strategyType: user.aiConfig?.strategyType || 'unknown',
      isRunning: user.aiConfig?.isRunning || false,
      balance,
      totalPnL,
      portfolio: portfolio.map((p) => ({
        token: {
          symbol: p.token.symbol,
          name: p.token.name,
        },
        amount: p.amount,
        pnl: (p.token.price ? p.amount * p.token.price.priceSol : 0) - p.amount * p.avgBuyPrice,
      })),
      recentTrades: user.trades.map((t) => ({
        type: t.type === 1 ? 'buy' : 'sell',
        tokenSymbol: t.token.symbol,
        amountSol: Number(t.amountSol),
        timestamp: t.createdAt.toISOString(),
      })),
      logs: user.aiLogs.map((log) => ({
        message: log.message,
        logType: log.logType,
        timestamp: log.timestamp.toString(),
      })),
    })
  } catch (error) {
    console.error('Get AI trader detail error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrPowerUser()

    // Delete AI trader config and user
    await prisma.aiTraderConfig.deleteMany({
      where: { userId: params.id },
    })

    await prisma.user.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete AI trader error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
