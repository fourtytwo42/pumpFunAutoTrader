import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/db'

async function ensureUserSession(userId: string) {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { session: true },
  })

  if (!existing) {
    return
  }

  if (!existing.session) {
    const now = BigInt(Date.now())
    await prisma.userSession.create({
      data: {
        userId,
        startTimestamp: now,
        currentTimestamp: now,
        playbackSpeed: new Prisma.Decimal(1),
        solBalanceStart: new Prisma.Decimal(10),
        isActive: true,
      },
    })
    return
  }

  if (existing.session.solBalanceStart < new Prisma.Decimal(10)) {
    await prisma.userSession.update({
      where: { userId },
      data: { solBalanceStart: new Prisma.Decimal(10) },
    })
  }
}

async function cleanupWallets() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      wallets: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          createdAt: true,
        },
      },
    },
  })

  let walletsRemoved = 0
  let walletsCreated = 0

  for (const user of users) {
    let [primary, ...extras] = user.wallets

    if (!primary) {
      primary = await prisma.wallet.create({
        data: {
          userId: user.id,
          label: 'Simulation Wallet',
          pubkey: `sim-${randomUUID().replace(/-/g, '')}`,
        },
      })
      walletsCreated += 1
    }

    if (extras.length > 0) {
      const extraIds = extras.map((wallet) => wallet.id)
      await prisma.$transaction(async (tx) => {
        for (const walletId of extraIds) {
          await tx.order.updateMany({
            where: { walletId },
            data: { walletId: primary!.id },
          })
          await tx.position.updateMany({
            where: { walletId },
            data: { walletId: primary!.id },
          })
          await tx.tradeTape.updateMany({
            where: { walletId },
            data: { walletId: primary!.id },
          })
          await tx.pnLLedger.updateMany({
            where: { walletId },
            data: { walletId: primary!.id },
          })
          await tx.agentEvent.updateMany({
            where: { walletId },
            data: { walletId: primary!.id },
          })
        }

        await tx.wallet.deleteMany({
          where: { id: { in: extraIds } },
        })
      })

      walletsRemoved += extras.length
    }

    await ensureUserSession(user.id)
  }

  console.log(`Wallet cleanup complete. Created ${walletsCreated} primary wallets and removed ${walletsRemoved} legacy wallets.`)
}

async function main() {
  try {
    await cleanupWallets()
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Wallet cleanup failed:', error)
  process.exit(1)
})

