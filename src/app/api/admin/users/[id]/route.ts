import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAdminOrPowerUser()
    const { username, password, role } = await request.json()

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Power users cannot change roles or edit admins
    if (session.user.role === 'power_user') {
      if (role && role !== user.role) {
        return NextResponse.json(
          { error: 'Power users cannot change user roles' },
          { status: 403 }
        )
      }
      if (user.role === 'admin') {
        return NextResponse.json(
          { error: 'Power users cannot edit admin accounts' },
          { status: 403 }
        )
      }
    }

    const updateData: any = {}
    if (username) updateData.username = username
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10)
    if (role && session.user.role === 'admin') updateData.role = role

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Update user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

