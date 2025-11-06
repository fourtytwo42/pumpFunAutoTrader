import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
      include: {
        price: true,
      },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Get recent trades
    const recentTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
      orderBy: { timestamp: 'desc' },
      take: 100,
    })

    // Get market activity stats
    const allTrades = await prisma.trade.findMany({
      where: { tokenId: token.id },
    })

    let buyVolume = 0
    let sellVolume = 0
    const uniqueTraders = new Set<string>()

    allTrades.forEach((trade) => {
      uniqueTraders.add(trade.userAddress)
      if (trade.type === 1) {
        buyVolume += Number(trade.amountUsd)
      } else {
        sellVolume += Number(trade.amountUsd)
      }
    })

    return NextResponse.json({
      ...token,
      createdAt: Number(token.createdAt),
      kingOfTheHillTimestamp: token.kingOfTheHillTimestamp ? Number(token.kingOfTheHillTimestamp) : null,
      completed: token.completed,
      price: token.price
        ? {
            priceSol: Number(token.price.priceSol),
            priceUsd: Number(token.price.priceUsd),
            lastTradeTimestamp: token.price.lastTradeTimestamp ? Number(token.price.lastTradeTimestamp) : null,
          }
        : null,
      stats: {
        buyVolume,
        sellVolume,
        totalVolume: buyVolume + sellVolume,
        uniqueTraders: uniqueTraders.size,
        totalTrades: allTrades.length,
      },
      recentTrades: recentTrades.slice(0, 20).map((t) => ({
        type: t.type === 1 ? 'buy' : 'sell',
        amountSol: Number(t.amountSol),
        amountUsd: Number(t.amountUsd),
        timestamp: t.timestamp.toString(),
      })),
    })
  } catch (error) {
    console.error('Get token error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

