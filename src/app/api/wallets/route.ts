import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/middleware'

const DEFAULT_LABEL = 'Simulation Wallet'

const normalizeLabel = (label?: unknown) => {
  if (typeof label !== 'string') return DEFAULT_LABEL
  const trimmed = label.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_LABEL
}

const normalizePubkey = (pubkey?: unknown) => {
  if (typeof pubkey === 'string' && pubkey.trim().length > 0) {
    return pubkey.trim()
  }
  return `sim-${randomUUID().replace(/-/g, '')}`
}

export async function GET() {
  const session = await requireAuth({ redirectOnFail: false })
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wallets = await prisma.wallet.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ wallets })
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth({ redirectOnFail: false })
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const label = normalizeLabel(body?.label)
    const pubkey = normalizePubkey(body?.pubkey)

    const existing = await prisma.wallet.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    })

    if (existing) {
      const updated = await prisma.wallet.update({
        where: { id: existing.id },
        data: {
          label,
        },
      })

      return NextResponse.json(updated)
    }

    const wallet = await prisma.wallet.create({
      data: {
        label,
        pubkey,
        userId: session.user.id,
      },
    })

    return NextResponse.json(wallet, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Wallet with this pubkey already exists' },
        { status: 409 }
      )
    }

    console.error('Create wallet error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

