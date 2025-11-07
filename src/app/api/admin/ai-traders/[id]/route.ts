import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const aiTrader = await prisma.user.findFirst({
      where: {
        id: params.id,
        isAiAgent: true,
      },
      include: {
        aiConfig: true,
      },
    })

    if (!aiTrader || !aiTrader.aiConfig) {
      return NextResponse.json({ error: 'AI trader not found' }, { status: 404 })
    }

    const config = aiTrader.aiConfig.configJson as any

    return NextResponse.json({
      id: aiTrader.id,
      username: aiTrader.username,
      configName: aiTrader.aiConfig.configName,
      strategyType: aiTrader.aiConfig.strategyType,
      isRunning: aiTrader.aiConfig.isRunning,
      themeColor: config?.themeColor || '#00ff88',
      llmProvider: config?.llm?.provider || 'unknown',
      llmModel: config?.llm?.model || 'unknown',
      systemPrompt: config?.systemPrompt || '',
    })
  } catch (error) {
    console.error('Get AI trader error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
