import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { setPlaybackSpeed } from '@/lib/simulation'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const { speed } = await request.json()

    if (!speed || typeof speed !== 'number' || speed <= 0 || speed > 100) {
      return NextResponse.json(
        { error: 'speed must be a number between 0 and 100' },
        { status: 400 }
      )
    }

    await setPlaybackSpeed(session.user.id, speed)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set playback speed error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

