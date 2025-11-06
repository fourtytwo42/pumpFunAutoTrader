import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

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
  const wallets = await prisma.wallet.findMany({
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ wallets })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const label = normalizeLabel(body?.label)
    const pubkey = normalizePubkey(body?.pubkey)

    const wallet = await prisma.wallet.create({
      data: {
        label,
        pubkey,
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

