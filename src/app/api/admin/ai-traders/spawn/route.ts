import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const {
      username,
      configName,
      strategyType,
      initialBalance,
      themeColor,
      llmProvider,
      llmModel,
      llmApiKey,
      llmBaseUrl,
      temperature,
      maxTokens,
      systemPrompt,
      // Risk profile settings
      maxPositionSizeUSD,
      maxDailySpendUSD,
      maxSlippageBps,
      cooldownSeconds,
      maxConcurrentPositions,
      minLiquidityUSD,
    } = await request.json()

    if (!username || !configName) {
      return NextResponse.json(
        { error: 'username and configName are required' },
        { status: 400 }
      )
    }

    if (!llmProvider || !llmModel) {
      return NextResponse.json(
        { error: 'LLM provider and model are required' },
        { status: 400 }
      )
    }

    // Check if username exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      )
    }

    // Generate random password for AI agent
    const password = `ai_${Math.random().toString(36).slice(2, 15)}`
    const passwordHash = await bcrypt.hash(password, 10)

    // Generate secure API key for external access
    const apiKey = `at_${crypto.randomBytes(32).toString('hex')}`

    // Create AI agent user
    const aiUser = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: 'user',
        isActive: true,
        isAiAgent: true,
        createdById: session.user.id,
      },
    })

    // Create AI trader config
    await prisma.aiTraderConfig.create({
      data: {
        userId: aiUser.id,
        configName,
        strategyType: strategyType || 'basic',
        configJson: {
          initialBalance: initialBalance || 10,
          themeColor: themeColor || '#00ff88',
          apiKey: apiKey, // Store API key for external tool access
          llm: {
            provider: llmProvider,
            model: llmModel,
            apiKey: llmApiKey,
            baseUrl: llmBaseUrl,
            temperature: temperature ?? 0.7,
            maxTokens: maxTokens ?? 1000,
          },
          systemPrompt:
            systemPrompt ||
            'You are an AI trading agent. Analyze market data and make informed trading decisions.',
        },
        isRunning: false,
        createdById: session.user.id,
      },
    })

    // Initialize simulation session
    await prisma.userSession.create({
      data: {
        userId: aiUser.id,
        startTimestamp: BigInt(Date.now()),
        currentTimestamp: BigInt(Date.now()),
        playbackSpeed: 1.0,
        solBalanceStart: initialBalance || 10,
        isActive: true,
      },
    })

    // Create wallet for AI trader
    await prisma.wallet.create({
      data: {
        userId: aiUser.id,
        label: `${configName} Wallet`,
        pubkey: `AI_WALLET_${aiUser.id}`,
      },
    })

    // Create risk profile for AI trader
    await prisma.riskProfile.create({
      data: {
        userId: aiUser.id,
        maxPositionSizeUSD: maxPositionSizeUSD || 100,
        maxDailySpendUSD: maxDailySpendUSD || 500,
        maxSlippageBps: maxSlippageBps || 500,
        cooldownSeconds: cooldownSeconds || 30,
        maxConcurrentPositions: maxConcurrentPositions || 5,
        minLiquidityUSD: minLiquidityUSD || 1000,
        blacklistedTokens: [],
      },
    })

    return NextResponse.json({
      success: true,
      userId: aiUser.id,
      username: aiUser.username,
      apiKey: apiKey, // Return API key once - save it!
      apiEndpoint: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/ai-trader/${aiUser.id}/tools`,
    })
  } catch (error) {
    console.error('Spawn AI trader error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

