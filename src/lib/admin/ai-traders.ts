import { prisma } from '@/lib/db'
import { getUserBalance, getUserPortfolio } from '@/lib/trading'

export interface AdminAiTrader {
  id: string
  username: string
  configName: string
  strategyType: string
  isRunning: boolean
  startedAt: string | null
  lastActivityAt: string | null
  balance: number
  portfolioValue: number
  equity: number
  totalPnL: number
  positions: number
  themeColor: string
  llmProvider: string
  llmModel: string
}

export async function listAdminAiTraders(): Promise<AdminAiTrader[]> {
  const aiUsers = await prisma.user.findMany({
    where: { isAiAgent: true },
    include: {
      aiConfig: true,
    },
  })

  const traders = await Promise.all(
    aiUsers.map(async (user) => {
      const [balance, portfolio] = await Promise.all([
        getUserBalance(user.id),
        getUserPortfolio(user.id),
      ])

      let portfolioValue = 0
      let totalPnL = 0

      for (const position of portfolio) {
        const qty = position.amount
        const priceSol = position.token.price ? position.token.price.priceSol : 0
        const currentValue = qty * priceSol
        const costBasis = qty * position.avgBuyPrice
        portfolioValue += currentValue
        totalPnL += currentValue - costBasis
      }

      const config = user.aiConfig?.configJson as any

      return {
        id: user.id,
        username: user.username,
        configName: user.aiConfig?.configName || 'Unnamed',
        strategyType: user.aiConfig?.strategyType || 'unknown',
        isRunning: user.aiConfig?.isRunning || false,
        startedAt: user.aiConfig?.startedAt?.toISOString() || null,
        lastActivityAt: user.aiConfig?.lastActivityAt?.toISOString() || null,
        balance,
        portfolioValue,
        equity: balance + portfolioValue,
        totalPnL,
        positions: portfolio.length,
        themeColor: config?.themeColor || '#00ff88',
        llmProvider: config?.llm?.provider || 'unknown',
        llmModel: config?.llm?.model || 'unknown',
      }
    })
  )

  return traders
}

