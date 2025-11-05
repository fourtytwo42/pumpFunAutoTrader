import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { mintAddress: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const interval = searchParams.get('interval') || '1h'
    const limit = parseInt(searchParams.get('limit') || '100')
    const startTime = searchParams.get('start_time')
    const endTime = searchParams.get('end_time')

    const token = await prisma.token.findUnique({
      where: { mintAddress: params.mintAddress },
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const intervalMinutes: Record<string, number> = {
      '1m': 1,
      '5m': 5,
      '1h': 60,
      '6h': 360,
      '24h': 1440,
    }

    const where: any = {
      tokenId: token.id,
      interval: intervalMinutes[interval] || 60,
    }

    if (startTime) {
      where.timestamp = { ...where.timestamp, gte: BigInt(startTime) }
    }
    if (endTime) {
      where.timestamp = { ...where.timestamp, lte: BigInt(endTime) }
    }

    const candles = await prisma.candle.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit,
    })

    return NextResponse.json({
      candles: candles.map((c) => ({
        timestamp: c.timestamp.toString(),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume),
      })),
    })
  } catch (error) {
    console.error('Get candles error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

