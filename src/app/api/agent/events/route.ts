import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const walletId = params.get('walletId') ?? undefined
    const mint = params.get('mint') ?? undefined
    const since = params.get('since')
    const limitParam = Number(params.get('limit') ?? '50')
    const limit = Math.min(Math.max(limitParam, 1), 200)

    const events = await prisma.agentEvent.findMany({
      where: {
        walletId,
        tokenMint: mint,
        ts: since ? { gte: new Date(since) } : undefined,
      },
      orderBy: { ts: 'desc' },
      take: limit,
    })

    return NextResponse.json({
      events: events.map((event) => ({
        id: event.id,
        ts: event.ts,
        kind: event.kind,
        level: event.level,
        walletId: event.walletId,
        tokenMint: event.tokenMint,
        traceId: event.traceId,
        rationale: event.rationale,
        input: event.input,
        output: event.output,
        metrics: event.metrics,
        toolName: event.toolName,
      })),
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021') {
      return NextResponse.json({ events: [] })
    }

    console.error('Get agent events error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
