import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { eventBus } from '@/lib/events'

export async function GET() {
  try {
    const messages = await prisma.chatMessage.findMany({
      orderBy: { ts: 'asc' },
      take: 200,
    })

    return NextResponse.json({ messages })
  } catch (error) {
    console.error('Get chat messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { role, content, meta } = body || {}
    if (!role || !content) {
      return NextResponse.json({ error: 'role and content are required' }, { status: 400 })
    }

    const message = await prisma.chatMessage.create({
      data: {
        role,
        content,
        meta: meta ?? {},
      },
    })

    eventBus.emitEvent({
      type: 'chat:new',
      payload: message,
    })

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Create chat message error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
