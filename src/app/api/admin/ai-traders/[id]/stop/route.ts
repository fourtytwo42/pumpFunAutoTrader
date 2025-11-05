import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminOrPowerUser()

    await prisma.aiTraderConfig.update({
      where: { userId: params.id },
      data: {
        isRunning: false,
        lastActivityAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Stop AI trader error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

