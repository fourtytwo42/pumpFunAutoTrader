import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

const MAX_TOKENS = 200_000
const ESTIMATED_TOKENS_PER_CHAR = 0.75

export async function GET() {
  try {
    const messages = await prisma.chatMessage.findMany({
      orderBy: { ts: 'desc' },
      take: 500,
    })

    const rolling: typeof messages = []
    let tokenEstimate = 0

    for (const message of messages) {
      const messageTokens = Math.ceil(message.content.length * ESTIMATED_TOKENS_PER_CHAR)
      if (tokenEstimate + messageTokens > MAX_TOKENS) {
        break
      }
      tokenEstimate += messageTokens
      rolling.push(message)
    }

    return NextResponse.json({
      tokensUsedEstimate: tokenEstimate,
      maxTokens: MAX_TOKENS,
      messages: rolling.reverse(),
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({
        tokensUsedEstimate: 0,
        maxTokens: MAX_TOKENS,
        messages: [],
      })
    }

    console.error('Get chat context error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
