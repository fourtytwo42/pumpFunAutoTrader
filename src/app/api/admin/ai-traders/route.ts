import { NextResponse } from 'next/server'
import { requireAdminOrPowerUser } from '@/lib/middleware'
import { listAdminAiTraders } from '@/lib/admin/ai-traders'

export async function GET() {
  try {
    const session = await requireAdminOrPowerUser()

    const traders = await listAdminAiTraders()

    return NextResponse.json({ traders })
  } catch (error) {
    console.error('Get AI traders error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

