import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdminOrPowerUser()
    const { isActive } = await request.json()

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Power users cannot deactivate admins
    if (session.user.role === 'power_user' && user.role === 'admin') {
      return NextResponse.json(
        { error: 'Power users cannot modify admin accounts' },
        { status: 403 }
      )
    }

    // Prevent deactivating yourself
    if (params.id === session.user.id && !isActive) {
      return NextResponse.json(
        { error: 'Cannot deactivate your own account' },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: { isActive },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Toggle user active error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

