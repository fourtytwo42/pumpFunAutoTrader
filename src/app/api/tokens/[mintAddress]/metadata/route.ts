import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensureTokensMetadata } from '@/lib/pump/metadata-service'

interface RouteParams {
  params: {
    mintAddress: string
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  const mintAddress = decodeURIComponent(params.mintAddress)

  const token = await prisma.token.findUnique({
    where: { mintAddress },
    include: { price: true },
  })

  if (!token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  await ensureTokensMetadata(prisma, [token])

  const refreshed = await prisma.token.findUnique({
    where: { mintAddress },
    select: {
      name: true,
      symbol: true,
      imageUri: true,
      twitter: true,
      telegram: true,
      website: true,
    },
  })

  return NextResponse.json({
    mintAddress,
    ...refreshed,
  })
}

