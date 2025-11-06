import { randomUUID } from 'crypto'
import { prisma } from './db'

export async function getOrCreateUserWallet(userId: string) {
  const existing = await prisma.wallet.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  })

  if (existing) {
    return existing
  }

  return prisma.wallet.create({
    data: {
      userId,
      label: 'Simulation Wallet',
      pubkey: `sim-${randomUUID().replace(/-/g, '')}`,
    },
  })
}

