import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const messages = await prisma.chatMessage.findMany({
      where: { userId: params.id },
      orderBy: { ts: 'asc' },
      take: 100, // Last 100 messages
    })

    return NextResponse.json({
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.ts.getTime(),
        meta: msg.meta,
      })),
    })
  } catch (error) {
    console.error('Fetch chat messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

