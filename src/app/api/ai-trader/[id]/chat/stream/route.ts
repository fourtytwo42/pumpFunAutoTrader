import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import { streamLLMRequest, LLMConfig, LLMMessage } from '@/lib/llm-providers'
import { AI_TRADING_TOOLS } from '@/lib/ai-tools'
import { executeAITool, TOOL_REGISTRY } from '@/lib/ai-tools'

/**
 * Streaming AI Chat API
 * 
 * Server-Sent Events (SSE) endpoint that streams:
 * - AI response chunks as they generate
 * - Tool execution state changes (running → completed)
 * - Final results
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth()
    if (!session) {
      return new Response('Unauthorized', { status: 401 })
    }

    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return new Response('Message is required', { status: 400 })
    }

    // Get AI trader config
    const aiTrader = await prisma.user.findUnique({
      where: { id: params.id },
      include: { aiConfig: true },
    })

    if (!aiTrader || !aiTrader.aiConfig) {
      return new Response('AI trader not found', { status: 404 })
    }

    const config = aiTrader.aiConfig.configJson as any
    const llmConfig: LLMConfig = {
      provider: config.llm?.provider || 'mlstudio',
      model: config.llm?.model || 'gpt-4',
      apiKey: config.llm?.apiKey,
      baseUrl: config.llm?.baseUrl,
      temperature: config.llm?.temperature ?? 0.7,
      maxTokens: config.llm?.maxTokens ?? 1000,
    }

    const systemPrompt =
      config.systemPrompt ||
      'You are an AI trading agent monitoring pump.fun tokens. Analyze market data and provide insights.'

    const contextWindowTokens = config.llm?.contextWindow ?? 20000
    
    // Get full tool list from registry
    const toolList = Object.entries(TOOL_REGISTRY)
      .map(([name, def]) => `• ${name} - ${def.description}`)
      .join('\n')

    const enhancedSystemPrompt = `${systemPrompt}

AVAILABLE TOOLS (${Object.keys(TOOL_REGISTRY).length} total):
Simply mention tool names naturally and the system executes them automatically.

${toolList}

IMPORTANT:
- Just mention tool names naturally - NO syntax, NO JSON
- You can chain multiple tools: "I'll check get_trending_tokens and get_sol_price"
- System auto-executes ALL mentioned tools and calls you back with results
- Do NOT provide URLs/links - you don't know the UI structure
- Focus on data analysis and trading recommendations

ANALYSIS WORKFLOW:
When user asks to find tokens:
1. Call get_trending_tokens (rich data: multi-timeframe, holders, volatility, unique traders)
2. Evaluate: momentum, buy/sell ratio (>60% bullish), holder concentration (<50% safe), whales (>100 SOL risky)
3. For top candidates, chain: get_token_details, get_recent_trades
4. Cross-reference: get_portfolio, get_risk_profile
5. Provide comprehensive analysis with data

Always explain your reasoning with actual data.`

    // Fetch chat history
    const recentMessages = await prisma.chatMessage.findMany({
      where: { userId: params.id },
      orderBy: { ts: 'desc' },
      take: 50,
    })

    // Build conversation history
    const estimateTokens = (text: string) => Math.ceil(text.length / 4)
    const systemPromptTokens = estimateTokens(enhancedSystemPrompt)
    const currentMessageTokens = estimateTokens(message)
    const reserveTokens = 2000
    const availableForHistory = contextWindowTokens - systemPromptTokens - currentMessageTokens - reserveTokens

    const conversationHistory: LLMMessage[] = []
    let usedTokens = 0

    for (const msg of recentMessages.reverse()) {
      const msgTokens = estimateTokens(msg.content)
      if (usedTokens + msgTokens > availableForHistory) break

      if (msg.role === 'user' || msg.role === 'assistant') {
        conversationHistory.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })
        usedTokens += msgTokens
      }
    }

    const messages: LLMMessage[] = [
      { role: 'system', content: enhancedSystemPrompt },
      ...conversationHistory,
      { role: 'user', content: message },
    ]

    // Save user message
    await prisma.chatMessage.create({
      data: {
        userId: params.id,
        role: 'user',
        content: message,
        meta: {},
      },
    })

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          let fullResponse = ''
          
          // Stream the initial AI response
          send({ type: 'start', message: 'AI thinking...' })

          for await (const chunk of streamLLMRequest(llmConfig, messages)) {
            if (chunk.type === 'content' && chunk.content) {
              fullResponse += chunk.content
              // Send the raw chunk - we'll clean it on the frontend
              send({ type: 'content', content: chunk.content })
            } else if (chunk.type === 'done') {
              send({ type: 'ai_response_complete', content: fullResponse })
              break
            }
          }

          // Parse for tool calls
          const toolSyntaxMatch = fullResponse.match(/to=["']?(?:functions\.)?(\w+)["']?/i)
          const toolCalls: string[] = []

          if (toolSyntaxMatch) {
            const toolName = toolSyntaxMatch[1]
            if (TOOL_REGISTRY[toolName]) {
              toolCalls.push(toolName)
            }
          }

          // Execute detected tools
          if (toolCalls.length > 0) {
            const noArgTools = ['get_sol_price', 'get_portfolio', 'get_risk_profile', 'get_open_orders', 'get_wallet_balance']
            const smartDefaults: Record<string, any> = {
              'get_trending_tokens': { sortBy: 'volume', timeframe: '1h', limit: 10 },
              'get_user_trades': { limit: 20 },
            }

            for (const toolName of toolCalls) {
              send({ type: 'tool_start', tool: toolName })

              try {
                const args = noArgTools.includes(toolName) ? {} : (smartDefaults[toolName] || {})
                const result = await executeAITool(toolName, args, params.id)

                send({ type: 'tool_complete', tool: toolName, result })

                // Save tool execution to DB
                await prisma.chatMessage.create({
                  data: {
                    userId: params.id,
                    role: 'assistant',
                    content: `✓ ${toolName}`,
                    meta: { toolName, result, status: 'completed' },
                  },
                })

                // Make second call with tool results
                send({ type: 'ai_analyzing', message: 'Analyzing results...' })

                const toolResultText = `Tool "${toolName}" returned: ${JSON.stringify(result, null, 2)}`
                const finalMessages: LLMMessage[] = [
                  { role: 'system', content: enhancedSystemPrompt },
                  ...conversationHistory,
                  { role: 'user', content: message },
                  { role: 'assistant', content: fullResponse },
                  { role: 'user', content: `[Tool Results]\n${toolResultText}\n\nNow respond to the user with this information.` },
                ]

                let finalContent = ''
                for await (const chunk of streamLLMRequest(llmConfig, finalMessages)) {
                  if (chunk.type === 'content' && chunk.content) {
                    finalContent += chunk.content
                    send({ type: 'content', content: chunk.content })
                  } else if (chunk.type === 'done') {
                    // Save final response
                    await prisma.chatMessage.create({
                      data: {
                        userId: params.id,
                        role: 'assistant',
                        content: finalContent,
                        meta: { toolExecuted: toolName },
                      },
                    })
                    break
                  }
                }
              } catch (error: any) {
                send({ type: 'tool_error', tool: toolName, error: error.message })
              }
            }
          } else {
            // No tools - just save the response
            await prisma.chatMessage.create({
              data: {
                userId: params.id,
                role: 'assistant',
                content: fullResponse,
                meta: {},
              },
            })
          }

          send({ type: 'done' })
          controller.close()
        } catch (error: any) {
          send({ type: 'error', message: error.message })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    console.error('Streaming chat error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

