import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { setSimulationTime, getSimulationState } from '@/lib/simulation'

export async function GET() {
  try {
    const session = await requireAuth()
    const state = await getSimulationState(session.user.id)
    return NextResponse.json(state)
  } catch (error) {
    console.error('Get simulation time error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth()
    const { timestamp } = await request.json()

    if (!timestamp || typeof timestamp !== 'string') {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 }
      )
    }

    await setSimulationTime(session.user.id, BigInt(timestamp))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set simulation time error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

