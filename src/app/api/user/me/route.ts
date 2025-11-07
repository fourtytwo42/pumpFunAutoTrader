import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'

export async function GET() {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
    })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

