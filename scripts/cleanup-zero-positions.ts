/**
 * Clean up portfolio positions with zero or near-zero token amounts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanupZeroPositions() {
  console.log('Cleaning up zero positions...')

  // Find all positions with very small amounts (effectively zero)
  const zeroPositions = await prisma.userPortfolio.findMany({
    where: {
      amount: {
        lt: 0.000001, // Less than 0.000001 tokens
      },
    },
    include: {
      user: { select: { username: true } },
      token: { select: { symbol: true, mintAddress: true } },
    },
  })

  console.log(`Found ${zeroPositions.length} positions with near-zero amounts`)

  for (const position of zeroPositions) {
    console.log(
      `  Deleting ${position.user.username}'s position in ${position.token.symbol} (${Number(position.amount).toFixed(9)} tokens)`
    )

    await prisma.userPortfolio.delete({
      where: {
        userId_tokenId: {
          userId: position.userId,
          tokenId: position.tokenId,
        },
      },
    })
  }

  console.log('✓ Cleanup complete!')
}

cleanupZeroPositions()
  .catch((error) => {
    console.error('Cleanup failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

