import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const walletId = params.get('walletId')
    const mint = params.get('mint')
    const cursor = params.get('cursor')
    const limitParam = Number(params.get('limit') ?? '50')
    const limit = Math.min(Math.max(limitParam, 1), 100)

    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 })
    }

    const trades = await prisma.tradeTape.findMany({
      where: {
        walletId,
        tokenMint: mint ?? undefined,
      },
      orderBy: { ts: 'desc' },
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
    })

    let nextCursor: string | null = null
    if (trades.length > limit) {
      const next = trades.pop()
      nextCursor = next?.id ?? null
    }

    return NextResponse.json({
      trades: trades.map((trade) => ({
        id: trade.id,
        ts: trade.ts,
        tokenMint: trade.tokenMint,
        side: trade.isBuy ? 'buy' : 'sell',
        baseAmount: Number(trade.baseAmount),
        quoteSol: Number(trade.quoteSol),
        priceUsd: trade.priceUsd ? Number(trade.priceUsd) : null,
        priceSol: trade.priceSol ? Number(trade.priceSol) : null,
        txSig: trade.txSig,
      })),
      nextCursor,
    })
  } catch (error) {
    console.error('Get trades error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
