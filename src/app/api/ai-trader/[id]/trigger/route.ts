import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { sendLLMRequest, LLMConfig } from '@/lib/llm-providers'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = await request.json()

    console.log(`[AI Trigger ${params.id}] Action: ${action}`)

    // Get AI trader config
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
    const llmConfig: LLMConfig = {
      provider: config.llm?.provider || 'openai',
      model: config.llm?.model || 'gpt-4',
      apiKey: config.llm?.apiKey,
      baseUrl: config.llm?.baseUrl,
      temperature: config.llm?.temperature ?? 0.7,
      maxTokens: config.llm?.maxTokens ?? 1000,
    }

    const systemPrompt =
      config.systemPrompt ||
      'You are an AI trading agent monitoring pump.fun tokens. Analyze market data and provide insights.'

    // Build action-specific prompts
    const actionPrompts: Record<string, string> = {
      poll_market:
        'Poll the latest market data from pump.fun. Check for trending tokens, volume changes, and price movements.',
      analyze_opportunities:
        'Analyze the current market to identify trading opportunities. Consider volume, momentum, and risk factors.',
      execute_trades:
        'Review your current analysis and execute any trades you recommend based on your strategy.',
      review_portfolio: 'Review your current portfolio positions and assess their performance.',
    }

    const userPrompt = actionPrompts[action] || `Execute action: ${action}`

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ]

    console.log(`[AI Trigger ${params.id}] Prompt:`, userPrompt)
    console.log(`[AI Trigger ${params.id}] Using ${llmConfig.provider}/${llmConfig.model}`)

    const response = await sendLLMRequest(llmConfig, messages)

    console.log(`[AI Trigger ${params.id}] Response:`, response.content)
    console.log(`[AI Trigger ${params.id}] Usage:`, response.usage)

    // Simulated tool calls (in a real implementation, this would parse the response for tool calls)
    const toolCalls: any[] = []

    // Update last activity
    await prisma.aiTraderConfig.update({
      where: { userId: params.id },
      data: { lastActivityAt: new Date() },
    })

    return NextResponse.json({
      response: response.content,
      usage: response.usage,
      toolCalls,
    })
  } catch (error: any) {
    console.error('AI trigger error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

