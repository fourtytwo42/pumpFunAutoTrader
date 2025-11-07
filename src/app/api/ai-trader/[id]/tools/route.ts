import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { executeAITool, TOOL_REGISTRY } from '@/lib/ai-tools'

/**
 * External Tool Execution API
 * 
 * Allows external AI agents to execute tools for a specific AI trader
 * using API key authentication.
 * 
 * POST /api/ai-trader/[id]/tools
 * Headers:
 *   X-API-Key: <api_key>
 * Body:
 *   {
 *     "tool": "get_trending_tokens",
 *     "arguments": { "sortBy": "volume", "timeframe": "1h", "limit": 5 }
 *   }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const aiTraderId = params.id

    // 1. Authenticate via API key
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('Authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: 'Missing API key',
          message: 'Provide API key in X-API-Key header or Authorization: Bearer <key>'
        },
        { status: 401 }
      )
    }

    // 2. Verify API key and get AI trader
    const aiTrader = await prisma.user.findFirst({
      where: {
        id: aiTraderId,
        isAiAgent: true,
        isActive: true,
      },
      include: {
        aiConfig: true,
      },
    })

    if (!aiTrader || !aiTrader.aiConfig) {
      console.warn(`[External Tool API] AI trader not found: ${aiTraderId}`)
      return NextResponse.json(
        { error: 'AI trader not found' },
        { status: 404 }
      )
    }

    // Verify API key
    const storedApiKey = (aiTrader.aiConfig.configJson as any)?.apiKey
    if (!storedApiKey || storedApiKey !== apiKey) {
      console.warn(`[External Tool API] Invalid API key for AI trader ${aiTraderId}`)
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 403 }
      )
    }

    // 3. Parse request body
    const body = await req.json()
    const { tool, arguments: toolArgs } = body

    if (!tool || typeof tool !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid "tool" field' },
        { status: 400 }
      )
    }

    // 4. Validate tool exists
    const toolDef = TOOL_REGISTRY[tool]
    if (!toolDef) {
      return NextResponse.json(
        {
          error: 'Tool not found',
          available_tools: Object.keys(TOOL_REGISTRY),
        },
        { status: 404 }
      )
    }

    // 5. Execute the tool
    console.log(`[External Tool API] ${aiTrader.username} executing: ${tool}`, toolArgs)
    
    const result = await executeAITool(tool, toolArgs || {}, aiTrader.id)

    // 6. Log the execution
    await prisma.agentEvent.create({
      data: {
        kind: 'tool_call',
        level: 'info',
        toolName: tool,
        input: toolArgs || {},
        output: result,
        metrics: {
          source: 'external_api',
          aiTraderId: aiTrader.id,
          aiTraderUsername: aiTrader.username,
          apiKey: apiKey.substring(0, 8) + '...',
          timestamp: new Date().toISOString(),
        },
      },
    })

    // 7. Return result
    return NextResponse.json({
      success: true,
      tool,
      result,
      ai_trader: {
        id: aiTrader.id,
        username: aiTrader.username,
      },
      timestamp: Date.now(),
    })

  } catch (error: any) {
    console.error('[External Tool API] Error:', error)
    
    return NextResponse.json(
      {
        error: 'Tool execution failed',
        message: error.message,
        tool: (await req.json()).tool,
      },
      { status: 500 }
    )
  }
}

/**
 * Get available tools for this AI trader
 * 
 * GET /api/ai-trader/[id]/tools
 * Headers:
 *   X-API-Key: <api_key>
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const aiTraderId = params.id

    // Authenticate
    const apiKey = req.headers.get('X-API-Key') || req.headers.get('Authorization')?.replace('Bearer ', '')
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing API key' },
        { status: 401 }
      )
    }

    // Verify API key
    const aiTrader = await prisma.user.findFirst({
      where: {
        id: aiTraderId,
        isAiAgent: true,
        isActive: true,
      },
      include: {
        aiConfig: true,
      },
    })

    if (!aiTrader || !aiTrader.aiConfig) {
      return NextResponse.json(
        { error: 'AI trader not found' },
        { status: 404 }
      )
    }

    // Verify API key
    const storedApiKey = (aiTrader.aiConfig.configJson as any)?.apiKey
    if (!storedApiKey || storedApiKey !== apiKey) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 403 }
      )
    }

    // Return available tools
    const tools = Object.entries(TOOL_REGISTRY).map(([name, def]) => ({
      name,
      description: def.description,
      category: def.category,
      riskLevel: def.riskLevel,
      parameters: def.parameters,
    }))

    return NextResponse.json({
      ai_trader: {
        id: aiTrader.id,
        username: aiTrader.username,
      },
      tools,
      count: tools.length,
    })

  } catch (error: any) {
    console.error('[External Tool API] Error listing tools:', error)
    
    return NextResponse.json(
      { error: 'Failed to list tools', message: error.message },
      { status: 500 }
    )
  }
}

