import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { sendLLMRequest, LLMConfig } from '@/lib/llm-providers'
import { AI_TRADING_TOOLS } from '@/lib/ai-tools'

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

    // Add trading tools to system prompt
    const toolsDescription = AI_TRADING_TOOLS.map(
      (tool) => `- ${tool.name}: ${tool.description}`
    ).join('\n')

    const enhancedSystemPrompt = `${systemPrompt}

You have access to the following trading tools:

${toolsDescription}

When analyzing or executing, describe which tools you would use and why.`

    // Build action-specific prompts with tool suggestions
    const actionPrompts: Record<string, string> = {
      poll_market: `Poll the latest market data. Use discoverUniverse to see trending tokens, then use tokenStats and recentTrades for detailed analysis of interesting tokens.`,
      analyze_opportunities: `Analyze the market for trading opportunities. First use discoverUniverse to find candidates, then use tokenStats, candles, and holdersSnapshot to evaluate them. Consider volume, momentum, holder distribution, and technical patterns.`,
      execute_trades: `Review your analysis and execute recommended trades. First check your portfolio, then use execTrade for any positions you want to take. Explain your reasoning for each trade.`,
      review_portfolio: `Review your current portfolio. Use the portfolio tool to see your positions, then analyze each holding using tokenStats and candles to assess performance and make hold/sell decisions.`,
    }

    const userPrompt = actionPrompts[action] || `Execute action: ${action}`

    const messages = [
      { role: 'system' as const, content: enhancedSystemPrompt },
      { role: 'user' as const, content: userPrompt },
    ]

    // Save trigger as system message
    await prisma.chatMessage.create({
      data: {
        userId: params.id,
        role: 'system',
        content: `Triggered: ${action}`,
        meta: { action },
      },
    })

    console.log(`[AI Trigger ${params.id}] Action: ${action}`)
    console.log(`[AI Trigger ${params.id}] Using ${llmConfig.provider}/${llmConfig.model}`)
    console.log(`[AI Trigger ${params.id}] Available tools:`, AI_TRADING_TOOLS.map((t) => t.name))

    const response = await sendLLMRequest(llmConfig, messages)

    console.log(`[AI Trigger ${params.id}] Response:`, response.content)
    console.log(`[AI Trigger ${params.id}] Usage:`, response.usage)

    // Parse response for tool mentions and execute simple data fetches
    const toolCalls: any[] = []
    
    // Check for portfolio request
    if (action === 'review_portfolio' || response.content.toLowerCase().includes('portfolio')) {
      console.log(`[AI Trigger ${params.id}] Executing tool: get_portfolio`)
      toolCalls.push({
        name: 'get_portfolio',
        status: 'executing',
        timestamp: Date.now(),
      })

      // Save tool call message
      await prisma.chatMessage.create({
        data: {
          userId: params.id,
          role: 'tool',
          content: 'Fetching portfolio data...',
          meta: { toolName: 'get_portfolio' },
        },
      })
    }

    // Check for market data request
    if (action === 'poll_market' || response.content.toLowerCase().includes('trending')) {
      console.log(`[AI Trigger ${params.id}] Executing tool: get_trending_tokens`)
      toolCalls.push({
        name: 'get_trending_tokens',
        status: 'executing',
        timestamp: Date.now(),
      })

      await prisma.chatMessage.create({
        data: {
          userId: params.id,
          role: 'tool',
          content: 'Fetching trending tokens...',
          meta: { toolName: 'get_trending_tokens' },
        },
      })
    }

    // Save AI response to database
    await prisma.chatMessage.create({
      data: {
        userId: params.id,
        role: 'assistant',
        content: response.content,
        meta: {
          usage: response.usage,
          model: llmConfig.model,
          provider: llmConfig.provider,
          action,
        },
      },
    })

    // Update last activity
    await prisma.aiTraderConfig.update({
      where: { userId: params.id },
      data: { lastActivityAt: new Date() },
    })

    return NextResponse.json({
      response: response.content,
      usage: response.usage,
      toolCalls,
      availableTools: AI_TRADING_TOOLS.map((t) => t.name),
    })
  } catch (error: any) {
    console.error('AI trigger error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

