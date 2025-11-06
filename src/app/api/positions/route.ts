import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTokenUsdPrice } from '@/lib/metrics'

export async function GET(request: NextRequest) {
  try {
    const walletId = request.nextUrl.searchParams.get('walletId')
    if (!walletId) {
      return NextResponse.json({ error: 'walletId is required' }, { status: 400 })
    }

    const positions = await prisma.position.findMany({
      where: { walletId },
      include: {
        token: {
          include: {
            price: true,
          },
        },
      },
    })

    const enriched = []
    for (const pos of positions) {
      const priceUsd =
        (await getTokenUsdPrice(pos.tokenMint)) ??
        (pos.token.price ? Number(pos.token.price.priceUsd) : 0)
      const qty = Number(pos.qty)
      const avgCostUsd = Number(pos.avgCostUsd)
      const mtmUsd = qty * priceUsd
      const pnlUsd = mtmUsd - qty * avgCostUsd

      enriched.push({
        id: pos.id,
        tokenMint: pos.tokenMint,
        symbol: pos.token.symbol,
        name: pos.token.name,
        qty,
        avgCostUsd,
        priceUsd,
        mtmUsd,
        pnlUsd,
        pnlPct: avgCostUsd > 0 ? (pnlUsd / (qty * avgCostUsd)) * 100 : 0,
        updatedAt: pos.updatedAt,
      })
    }

    return NextResponse.json({ positions: enriched })
  } catch (error) {
    console.error('Get positions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
