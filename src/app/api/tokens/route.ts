import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const skip = (page - 1) * limit

    const where: any = {}
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { symbol: { contains: search, mode: 'insensitive' } },
        { mintAddress: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [tokens, total] = await Promise.all([
      prisma.token.findMany({
        where,
        include: {
          price: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.token.count({ where }),
    ])

    // Calculate volume and price changes for each token
    const tokensWithStats = await Promise.all(
      tokens.map(async (token) => {
        // Get recent trades for volume calculation (last 10 minutes in simulated time)
        // For now, we'll use a simplified approach
        const recentTrades = await prisma.trade.findMany({
          where: {
            tokenId: token.id,
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: 100,
        })

        let buyVolume = 0
        let sellVolume = 0
        let uniqueTraders = new Set<string>()

        recentTrades.forEach((trade) => {
          uniqueTraders.add(trade.userAddress)
          if (trade.type === 1) {
            buyVolume += Number(trade.amountUsd)
          } else {
            sellVolume += Number(trade.amountUsd)
          }
        })

        const totalVolume = buyVolume + sellVolume
        const volumeRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5

        return {
          id: token.id,
          mintAddress: token.mintAddress,
          symbol: token.symbol,
          name: token.name,
          imageUri: token.imageUri,
          price: token.price
            ? {
                priceSol: Number(token.price.priceSol),
                priceUsd: Number(token.price.priceUsd),
              }
            : null,
          buyVolume,
          sellVolume,
          totalVolume,
          volumeRatio,
          uniqueTraders: uniqueTraders.size,
        }
      })
    )

    return NextResponse.json({
      tokens: tokensWithStats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Get tokens error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

