import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    const { username, configName, strategyType, initialBalance } = await request.json()

    if (!username || !configName) {
      return NextResponse.json(
        { error: 'username and configName are required' },
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

    return NextResponse.json({
      success: true,
      userId: aiUser.id,
      username: aiUser.username,
      apiKey: `AI_${aiUser.id}_${password.slice(0, 8)}`, // Simplified API key generation
    })
  } catch (error) {
    console.error('Spawn AI trader error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

