import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/middleware'
import { Prisma } from '@prisma/client'

function normaliseString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export async function GET() {
  const session = await requireAuth({ redirectOnFail: false })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      avatarUrl: true,
      createdAt: true,
      role: true,
      isAiAgent: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    role: user.role,
    isAiAgent: user.isAiAgent,
  })
}

export async function PUT(request: NextRequest) {
  const session = await requireAuth({ redirectOnFail: false })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const username = normaliseString(body.username)
  const email = normaliseString(body.email)
  const avatarUrl = normaliseString(body.avatarUrl)

  if (username && username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters long' }, { status: 400 })
  }

  const updateData: {
    username?: string
    email?: string | null
    avatarUrl?: string | null
  } = {}

  if (username) {
    updateData.username = username
  }
  if (body.email !== undefined) {
    updateData.email = email
  }
  if (body.avatarUrl !== undefined) {
    updateData.avatarUrl = avatarUrl
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No changes submitted' }, { status: 400 })
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
      },
    })

    return NextResponse.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      avatarUrl: updatedUser.avatarUrl,
    })
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target) ? error.meta?.target[0] : error.meta?.target
      if (target?.includes('username')) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
      }
      if (target?.includes('email')) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
      }
    }
    console.error('[user.profile] Failed to update user profile', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}


