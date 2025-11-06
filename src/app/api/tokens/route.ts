import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    const sortBy = searchParams.get('sortBy') || 'volume'
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
        // Get all trades for the token (24h volume)
        // Volume is calculated in SOL for consistency with pump.fun
        const twentyFourHoursAgo = BigInt(Date.now() - 24 * 60 * 60 * 1000)
        
        const allTrades = await prisma.trade.findMany({
          where: {
            tokenId: token.id,
            timestamp: {
              gte: twentyFourHoursAgo,
            },
          },
        })

        // Also get all trades for unique traders count
        const allTradesForTraders = await prisma.trade.findMany({
          where: {
            tokenId: token.id,
          },
          select: {
            userAddress: true,
          },
        })

        let buyVolumeSol = 0
        let sellVolumeSol = 0
        let uniqueTraders = new Set<string>()

        // Calculate volume in SOL (more accurate than USD)
        allTrades.forEach((trade) => {
          if (trade.type === 1) {
            // Buy - volume is SOL spent
            buyVolumeSol += Number(trade.amountSol)
          } else {
            // Sell - volume is SOL received
            sellVolumeSol += Number(trade.amountSol)
          }
        })

        // Count unique traders from all trades
        allTradesForTraders.forEach((trade) => {
          uniqueTraders.add(trade.userAddress)
        })

        // Get SOL price for USD conversion (use latest or fallback)
        let solPriceUsd = 160 // Fallback
        try {
          const latestSolPrice = await prisma.solPrice.findFirst({
            orderBy: {
              timestamp: 'desc',
            },
          })
          if (latestSolPrice) {
            solPriceUsd = Number(latestSolPrice.priceUsd)
          }
        } catch (error) {
          console.warn('Failed to fetch SOL price, using fallback')
        }

        // Convert SOL volume to USD for display
        const buyVolume = buyVolumeSol * solPriceUsd
        const sellVolume = sellVolumeSol * solPriceUsd
        const totalVolume = buyVolume + sellVolume
        const volumeRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5

        // Calculate price info - try to get accurate price from latest trade or use stored price
        let priceSol = 0
        let priceUsd = 0
        if (token.price) {
          priceSol = Number(token.price.priceSol)
          const storedPriceUsd = Number(token.price.priceUsd)
          
          // If stored priceUsd is meaningful (> 0.000001), use it
          // Otherwise calculate from priceSol
          if (storedPriceUsd > 0.000001) {
            priceUsd = storedPriceUsd
          } else if (priceSol > 0) {
            // Calculate USD from SOL price using current SOL/USD rate
            priceUsd = priceSol * solPriceUsd
          }
          
          // If priceUsd is still extremely small, try to get from latest trade's market cap
          if (priceUsd < 0.000000001 && token.totalSupply) {
            // Get the most recent trade with market cap info if available
            const latestTrade = await prisma.trade.findFirst({
              where: { tokenId: token.id },
              orderBy: { timestamp: 'desc' },
            })
            // Note: We don't store market cap in trades, so this is a fallback
            // The real fix would be to ensure market cap is used during ingestion
          }
        }

        return {
          id: token.id,
          mintAddress: token.mintAddress,
          symbol: token.symbol,
          name: token.name,
          imageUri: token.imageUri,
          twitter: token.twitter,
          telegram: token.telegram,
          website: token.website,
          price: token.price
            ? {
                priceSol,
                priceUsd,
              }
            : null,
          buyVolume,
          sellVolume,
          totalVolume,
          volumeRatio,
          uniqueTraders: uniqueTraders.size,
          buyVolumeSol,
          sellVolumeSol,
          totalVolumeSol: buyVolumeSol + sellVolumeSol,
        }
      })
    )

    // Sort tokens based on sortBy parameter
    let sortedTokens = tokensWithStats
    if (sortBy === 'volume') {
      sortedTokens.sort((a, b) => b.totalVolume - a.totalVolume)
    } else if (sortBy === 'traders') {
      sortedTokens.sort((a, b) => b.uniqueTraders - a.uniqueTraders)
    } else if (sortBy === 'price') {
      sortedTokens.sort((a, b) => {
        const priceA = a.price?.priceSol || 0
        const priceB = b.price?.priceSol || 0
        return priceB - priceA
      })
    }

    return NextResponse.json({
      tokens: sortedTokens,
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

