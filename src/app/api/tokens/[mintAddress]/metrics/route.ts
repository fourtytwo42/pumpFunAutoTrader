import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTokenUsdPrice, getLatestSolPrice } from '@/lib/metrics'

export async function GET(
  _: Request,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const mint = params.mintAddress
    const [token, holderSnapshot, activity] = await Promise.all([
      prisma.token.findUnique({
        where: { mintAddress: mint },
        include: {
          tokenStat: true,
        },
      }),
      prisma.holderSnapshot.findFirst({
        where: { tokenMint: mint },
        orderBy: { ts: 'desc' },
      }),
      prisma.marketActivitySnapshot.findMany({
        where: { tokenMint: mint },
        orderBy: { ts: 'desc' },
        take: 5,
      }),
    ])

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const tokenPx = token.tokenStat?.px

    const [usdPriceOverride, latestSolPrice] = await Promise.all([
      getTokenUsdPrice(mint),
      tokenPx ? getLatestSolPrice() : Promise.resolve(null),
    ])

    const priceUsd = usdPriceOverride ?? (tokenPx && latestSolPrice != null
      ? Number(tokenPx) * latestSolPrice
      : null)

    const priceSol = tokenPx != null ? Number(tokenPx) : null

    const activityByWindow: Record<string, unknown> = {}
    for (const entry of activity) {
      if (!activityByWindow[entry.window]) {
        activityByWindow[entry.window] = entry.payload
      }
    }

    return NextResponse.json({
      mint,
      priceUsd,
      priceSol,
      athMcapUsd: token.tokenStat?.ddFromATHPct
        ? Number(token.tokenStat.ddFromATHPct)
        : null,
      drawdownPct: token.tokenStat?.ddFromATHPct
        ? Number(token.tokenStat.ddFromATHPct)
        : null,
      holders: holderSnapshot
        ? {
            total: holderSnapshot.total,
            topJson: holderSnapshot.topJson,
          }
        : null,
      activity: activityByWindow,
    })
  } catch (error) {
    console.error('Token metrics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
