import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  try {
    const session = await requireAdminOrPowerUser()
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        isAiAgent: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    const { username, password, role } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Power users cannot create admins
    if (session.user.role === 'power_user' && role === 'admin') {
      return NextResponse.json(
        { error: 'Power users cannot create admin accounts' },
        { status: 403 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role || 'user',
        isActive: true,
        isAiAgent: false,
        createdById: session.user.id,
      },
    })

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

