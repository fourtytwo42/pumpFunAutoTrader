import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete all chat messages for this AI trader
    const deleted = await prisma.chatMessage.deleteMany({
      where: { userId: params.id },
    })

    console.log(`[AI Chat ${params.id}] Cleared ${deleted.count} messages`)

    return NextResponse.json({
      success: true,
      deletedCount: deleted.count,
    })
  } catch (error) {
    console.error('Clear chat messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

