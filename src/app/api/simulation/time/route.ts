import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/middleware'
import { setSimulationTime, getSimulationState } from '@/lib/simulation'

export async function GET() {
  try {
    const session = await requireAuth({ redirectOnFail: false })

    if (!session) {
      console.warn('Simulation time request unauthorized')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const state = await getSimulationState(session.user.id)
    if (!state) {
      return NextResponse.json(null)
    }

    return NextResponse.json({
      currentTimestamp: state.currentTimestamp.toString(),
      startTimestamp: state.startTimestamp.toString(),
      playbackSpeed: state.playbackSpeed,
      isActive: state.isActive,
    })
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
    const session = await requireAuth({ redirectOnFail: false })

    if (!session) {
      console.warn('Set simulation time unauthorized')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { timestamp } = await request.json()

    if (!timestamp || typeof timestamp !== 'string') {
      return NextResponse.json(
        { error: 'timestamp is required' },
        { status: 400 }
      )
    }

    if (!/^-?\d+$/.test(timestamp)) {
      return NextResponse.json(
        { error: 'timestamp must be an integer string' },
        { status: 400 }
      )
    }

    let timestampBigInt: bigint
    try {
      timestampBigInt = BigInt(timestamp)
    } catch {
      return NextResponse.json(
        { error: 'timestamp could not be parsed' },
        { status: 400 }
      )
    }

    await setSimulationTime(session.user.id, timestampBigInt)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Set simulation time error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
