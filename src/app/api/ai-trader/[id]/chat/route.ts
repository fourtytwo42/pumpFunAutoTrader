import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { sendLLMRequest, LLMConfig, LLMMessage } from '@/lib/llm-providers'
import { AI_TRADING_TOOLS, executeAITool } from '@/lib/ai-tools'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message } = await request.json()

    // Save user message to database
    await prisma.chatMessage.create({
      data: {
        userId: params.id,
        role: 'user',
        content: message,
        meta: {
          source: 'web_ui',
          sessionUserId: session.user.id,
        },
      },
    })

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
      tools: AI_TRADING_TOOLS.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    }

    const systemPrompt =
      config.systemPrompt ||
      'You are an AI trading agent monitoring pump.fun tokens. Analyze market data and provide insights.'

    // Organize tools by category for better prompting
    const { getToolsByCategory } = await import('@/lib/ai-tools')
    const marketTools = getToolsByCategory('market')
    const analysisTools = getToolsByCategory('analysis')
    const portfolioTools = getToolsByCategory('portfolio')
    const orderTools = getToolsByCategory('orders')
    const executionTools = getToolsByCategory('execution')
    const riskTools = getToolsByCategory('risk')

    const enhancedSystemPrompt = `${systemPrompt}

═══════════════════════════════════════════════════════════════
TRADING TOOLS AVAILABLE (20 total)
═══════════════════════════════════════════════════════════════

MARKET DISCOVERY & DATA (${marketTools.length} tools):
${marketTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

ANALYSIS & RESEARCH (${analysisTools.length} tools):
${analysisTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

PORTFOLIO MANAGEMENT (${portfolioTools.length} tools):
${portfolioTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

ORDER MANAGEMENT (${orderTools.length} tools):
${orderTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

TRADE EXECUTION (${executionTools.length} tools):
${executionTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

RISK & LIMITS (${riskTools.length} tools):
${riskTools.map((t) => `  • ${t.name}: ${t.description}`).join('\n')}

═══════════════════════════════════════════════════════════════
HOW TO USE TOOLS
═══════════════════════════════════════════════════════════════

1. Simply MENTION the tool name naturally in your response
2. System will execute it and call you back with results
3. DO NOT output tool syntax, JSON, or function calls
4. Be conversational and explain what you're doing

EXAMPLES:

User: "What's the price of SOL?"
You: "Let me check get_sol_price for you."
[System executes and returns: {"solPriceUsd": 157.36}]
You: "The current price of SOL is $157.36 USD."

User: "Find me some good trading opportunities"
You: "I'll use get_trending_tokens to discover trending tokens, then analyze the best candidates with get_token_metrics."
[System executes both tools]
You: "I found 15 trending tokens. The most interesting is DOGE with..."

User: "Should I buy DOGE?"
You: "Let me analyze DOGE first. I'll check get_token_details for fundamentals, get_token_candles for price action, get_token_holders for whale concentration, and estimate_trade_impact to see the slippage."
[System executes all tools]
You: "Based on my analysis: DOGE shows strong momentum (RSI: 65), low whale concentration (Gini: 0.42), and minimal slippage (2.1% for 0.1 SOL). I recommend..."

═══════════════════════════════════════════════════════════════
TRADING BEST PRACTICES
═══════════════════════════════════════════════════════════════

ALWAYS before executing trades:
1. Check get_risk_profile - verify limits and cooldowns
2. Use estimate_trade_impact - calculate slippage and fees
3. Analyze with get_token_metrics - check liquidity and momentum
4. Review get_token_holders - assess whale risk

Prefer limit orders (create_limit_order) over market orders when:
- Price impact > 2%
- Volatile conditions (high RSI or recent spike)
- Not urgent / can wait for better price

Use market orders (execute_market_buy/sell) when:
- Price impact < 1%
- Strong conviction on immediate entry/exit
- Time-sensitive opportunity

Risk management:
- Respect your risk profile limits
- Diversify across multiple positions
- Use stop-losses (via limit sell orders)
- Monitor get_open_orders regularly

═══════════════════════════════════════════════════════════════`

    // Build conversation
    const messages = [
      { role: 'system' as const, content: enhancedSystemPrompt },
      { role: 'user' as const, content: message },
    ]

    console.log(`[AI Chat ${params.id}] User message:`, message)
    console.log(`[AI Chat ${params.id}] Using ${llmConfig.provider}/${llmConfig.model}`)
    console.log(`[AI Chat ${params.id}] Available tools:`, AI_TRADING_TOOLS.map((t) => t.name))

    const response = await sendLLMRequest(llmConfig, messages)

    console.log(`[AI Chat ${params.id}] Response:`, response.content)
    console.log(`[AI Chat ${params.id}] Usage:`, response.usage)
    console.log(`[AI Chat ${params.id}] Tool Calls:`, response.toolCalls)

    const executedTools: any[] = []

    // Parse response for tool calls (fallback for models without native function calling)
    let parsedToolCalls = response.toolCalls || []
    
    if (parsedToolCalls.length === 0 && response.content) {
      // Try to extract tool calls from text response
      const { TOOL_REGISTRY } = await import('@/lib/ai-tools')
      
      // Tools that can be auto-executed without arguments
      const noArgTools = [
        'get_sol_price',
        'get_portfolio',
        'get_risk_profile',
        'get_open_orders',
        'get_wallet_balance',
      ]

      // Try to detect and auto-execute tools
      for (const toolName of Object.keys(TOOL_REGISTRY)) {
        const toolNamePattern = new RegExp(`\\b${toolName}\\b`, 'i')
        if (toolNamePattern.test(response.content)) {
          console.log(`[AI Chat ${params.id}] Detected tool mention: ${toolName}`)
          
          // Auto-execute tools that don't require arguments
          if (noArgTools.includes(toolName)) {
            parsedToolCalls.push({
              name: toolName,
              arguments: {},
            })
          }
          
          // TODO: Add smarter argument extraction for tools that need parameters
          // For now, AI must use native function calling or be more explicit
        }
      }
    }

    // Execute tool calls if present
    if (parsedToolCalls.length > 0) {
      for (const toolCall of parsedToolCalls) {
        console.log(`[AI Chat ${params.id}] Executing tool: ${toolCall.name}`, toolCall.arguments)

        // Save tool call message
        const toolMessage = await prisma.chatMessage.create({
          data: {
            userId: params.id,
            role: 'tool',
            content: `Executing ${toolCall.name}...`,
            meta: {
              toolName: toolCall.name,
              arguments: toolCall.arguments,
              status: 'executing',
            },
          },
        })

        try {
          const toolResult = await executeAITool(toolCall.name, toolCall.arguments, params.id)
          
          // Update the same message to show completion
          await prisma.chatMessage.update({
            where: { id: toolMessage.id },
            data: {
              content: `✓ ${toolCall.name} completed`,
              meta: {
                toolName: toolCall.name,
                result: toolResult,
                status: 'completed',
              },
            },
          })

          executedTools.push({
            name: toolCall.name,
            arguments: toolCall.arguments,
            result: toolResult,
          })

          console.log(`[AI Chat ${params.id}] Tool ${toolCall.name} result:`, toolResult)
        } catch (error: any) {
          console.error(`[AI Chat ${params.id}] Tool ${toolCall.name} failed:`, error)
          
          // Update the same message to show failure
          await prisma.chatMessage.update({
            where: { id: toolMessage.id },
            data: {
              content: `✗ ${toolCall.name} failed: ${error.message}`,
              meta: {
                toolName: toolCall.name,
                error: error.message,
                status: 'failed',
              },
            },
          })
        }
      }

      // Make a second LLM call with tool results so AI can respond naturally
      // Format tool results as a user message with the data
      const toolResultsText = executedTools
        .map((tool) => `Tool "${tool.name}" returned: ${JSON.stringify(tool.result, null, 2)}`)
        .join('\n\n')

      const finalMessages: LLMMessage[] = [
        { role: 'system' as const, content: enhancedSystemPrompt },
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: response.content },
        { role: 'user' as const, content: `[Tool Results]\n${toolResultsText}\n\nNow respond to the user with this information.` },
      ]

      console.log(`[AI Chat ${params.id}] Making second LLM call with tool results`)
      const finalResponse = await sendLLMRequest(llmConfig, finalMessages)
      console.log(`[AI Chat ${params.id}] Final response:`, finalResponse.content)

      // Save final assistant response to database
      await prisma.chatMessage.create({
        data: {
          userId: params.id,
          role: 'assistant',
          content: finalResponse.content || '(No response)',
          meta: {
            usage: finalResponse.usage,
            model: llmConfig.model,
            provider: llmConfig.provider,
            executedTools,
          },
        },
      })

      return NextResponse.json({
        response: finalResponse.content,
        usage: finalResponse.usage,
        availableTools: AI_TRADING_TOOLS.map((t) => t.name),
        toolCalls: executedTools,
      })
    }

    // No tool calls - save assistant response directly
    await prisma.chatMessage.create({
      data: {
        userId: params.id,
        role: 'assistant',
        content: response.content || '(No response)',
        meta: {
          usage: response.usage,
          model: llmConfig.model,
          provider: llmConfig.provider,
        },
      },
    })

    return NextResponse.json({
      response: response.content,
      usage: response.usage,
      availableTools: AI_TRADING_TOOLS.map((t) => t.name),
      toolCalls: executedTools,
    })
  } catch (error: any) {
    console.error('AI chat error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

