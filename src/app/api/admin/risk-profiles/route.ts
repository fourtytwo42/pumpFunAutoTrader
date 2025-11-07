import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { getRiskProfile, updateRiskProfile, getTodayUsage } from '@/lib/risk-profiles'

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const params = request.nextUrl.searchParams
    const userId = params.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const [profile, usage] = await Promise.all([
      getRiskProfile(userId),
      getTodayUsage(userId),
    ])

    return NextResponse.json({
      profile,
      usage,
    })
  } catch (error) {
    console.error('Get risk profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAdminOrPowerUser()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId, ...updates } = body

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const profile = await updateRiskProfile(userId, updates)

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Update risk profile error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

