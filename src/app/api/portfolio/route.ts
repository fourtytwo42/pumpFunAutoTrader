import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getLatestSolPrice, getTokenUsdPrice } from '@/lib/metrics'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const walletId = searchParams.get('walletId')
    const wallet = walletId
      ? await prisma.wallet.findUnique({
          where: { id: walletId },
          include: {
            positions: true,
          },
        })
      : await prisma.wallet.findFirst({
          include: {
            positions: true,
          },
        })

    if (!wallet) {
      return NextResponse.json(
        { error: 'Wallet not found' },
        { status: 404 }
      )
    }

    const solUsd = (await getLatestSolPrice()) ?? 0

    const positions = []
    let unrealizedUsd = 0

    for (const position of wallet.positions) {
      const priceUsd = (await getTokenUsdPrice(position.tokenMint)) ?? 0
      const qty = Number(position.qty)
      const avgCost = Number(position.avgCostUsd)
      const mtmUsd = qty * priceUsd
      const costUsd = qty * avgCost
      const pnlUsd = mtmUsd - costUsd

      unrealizedUsd += pnlUsd

      positions.push({
        mint: position.tokenMint,
        qty,
        avgCostUsd: avgCost,
        priceUsd,
        mtmUsd,
        pnlUsd,
        pnlPct: costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0,
      })
    }

    const realizedLedger = await prisma.pnLLedger.aggregate({
      _sum: { amountUsd: true },
      where: {
        walletId: wallet.id,
        type: {
          in: ['realized', 'fee'],
        },
      },
    })

    const realizedUsd = Number(realizedLedger._sum.amountUsd ?? 0)
    const equityUsd = realizedUsd + unrealizedUsd

    return NextResponse.json({
      walletId: wallet.id,
      solUsd,
      equityUsd,
      realizedUsd,
      unrealizedUsd,
      positions,
    })
  } catch (error) {
    console.error('Get portfolio error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
