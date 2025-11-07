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

    const enhancedSystemPrompt = `${systemPrompt}

AVAILABLE TOOLS:
You have access to trading tools. Simply mention them naturally in your response like "Let me check get_trending_tokens" and the system will execute them automatically.

Key tools:
• get_trending_tokens - find hot tokens with multi-timeframe data, holder analysis, volatility
• get_token_details - detailed info on a specific token
• get_portfolio - your current positions
• get_wallet_balance - check SOL balance
• get_sol_price - current SOL price
• buy_token / sell_token - execute trades

IMPORTANT:
- Just mention tool names naturally - NO syntax, NO JSON, NO special formatting
- The system detects tool names and executes them automatically
- You'll be called back with results to provide your final answer

When analyzing tokens from get_trending_tokens, look at:
- Multi-timeframe momentum (5m, 1h, 6h, 24h)
- Holder concentration (top 10 > 50% = risky)  
- Whale presence (>100 SOL = manipulation risk)
- Buy/sell ratio (>60% = bullish)
- Volatility (MODERATE = good, HIGH = risky)

Always explain your reasoning with data.`

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
      
      console.log(`[AI Chat ${params.id}] No native tool calls, parsing response text`)

      // Tools that can be auto-executed without arguments
      const noArgTools = [
        'get_sol_price',
        'get_portfolio',
        'get_risk_profile',
        'get_open_orders',
        'get_wallet_balance',
      ]
      
      // Tools that need arguments but can use smart defaults
      const smartDefaultTools: Record<string, any> = {
        'get_trending_tokens': { sortBy: 'volume', timeframe: '1h', limit: 10 },
        'get_user_trades': { limit: 20 },
      }

      // SPECIAL HANDLING: Some models output their own tool syntax
      // Extract tool names from formats like:
      // "<|channel|>commentary to="get_sol_price""
      // "<|start|>assistant<|channel|>commentary to=functions.get_trending_tokens"
      const toolSyntaxMatch = response.content.match(/to=["']?(?:functions\.)?(\w+)["']?/i)
      if (toolSyntaxMatch) {
        const toolName = toolSyntaxMatch[1]
        console.log(`[AI Chat ${params.id}] Extracted tool from model syntax: ${toolName}`)
        
        // Check if it's a valid tool
        if (TOOL_REGISTRY[toolName]) {
          // Auto-execute with smart defaults
          if (noArgTools.includes(toolName)) {
            parsedToolCalls.push({ name: toolName, arguments: {} })
          } else if (smartDefaultTools[toolName]) {
            parsedToolCalls.push({ name: toolName, arguments: smartDefaultTools[toolName] })
          }
        }
      }

      // If no tools extracted from syntax, try natural language detection
      if (parsedToolCalls.length === 0) {
        for (const toolName of Object.keys(TOOL_REGISTRY)) {
          // Look for natural language patterns like:
          // "let me check get_trending_tokens"
          // "I'll use get_sol_price"
          // "checking get_portfolio"
          const patterns = [
            new RegExp(`\\b(check|use|get|fetch|look at|see|view)\\s+${toolName}\\b`, 'i'),
            new RegExp(`\\b${toolName}\\b`, 'i'), // fallback to just tool name
          ]
          
          let found = false
          for (const pattern of patterns) {
            if (pattern.test(response.content)) {
              console.log(`[AI Chat ${params.id}] Detected tool mention: ${toolName}`)
              found = true
              break
            }
          }
          
          if (found) {
            // Auto-execute tools that don't require arguments
            if (noArgTools.includes(toolName)) {
              parsedToolCalls.push({
                name: toolName,
                arguments: {},
              })
            }
            // Auto-execute tools with smart defaults
            else if (smartDefaultTools[toolName]) {
              parsedToolCalls.push({
                name: toolName,
                arguments: smartDefaultTools[toolName],
              })
            }
          }
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

