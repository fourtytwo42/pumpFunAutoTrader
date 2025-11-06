import type { Prisma, PrismaClient, UserSession } from '@prisma/client'
import { prisma } from './db'

export interface SimulationState {
  currentTimestamp: bigint
  startTimestamp: bigint
  playbackSpeed: number
  isActive: boolean
}

type PrismaLikeClient = PrismaClient | Prisma.TransactionClient

async function advanceSimulationSession(
  userId: string,
  client: PrismaLikeClient = prisma
): Promise<UserSession | null> {
  let session = await client.userSession.findUnique({
    where: { userId },
  })

  if (!session) {
    const nowMs = Date.now()
    session = await client.userSession.create({
      data: {
        userId,
        startTimestamp: BigInt(nowMs),
        currentTimestamp: BigInt(nowMs),
        playbackSpeed: 1.0,
        solBalanceStart: 10,
        isActive: false,
      },
    })
  }

  if (!session.isActive) {
    return session
  }

  const playbackSpeed = Number(session.playbackSpeed)
  if (!Number.isFinite(playbackSpeed) || playbackSpeed <= 0) {
    return session
  }

  const lastRealUpdate = session.updatedAt.getTime()
  const now = Date.now()
  if (now <= lastRealUpdate) {
    return session
  }

  const elapsedMs = now - lastRealUpdate
  const advanceMsNumber = Math.round(elapsedMs * playbackSpeed)

  if (!Number.isFinite(advanceMsNumber) || advanceMsNumber <= 0) {
    return session
  }

  const updated = await client.userSession.update({
    where: { userId },
    data: {
      currentTimestamp: session.currentTimestamp + BigInt(advanceMsNumber),
      updatedAt: new Date(now),
    },
  })

  return updated
}

export async function getSimulationState(userId: string): Promise<SimulationState | null> {
  const session = await advanceSimulationSession(userId)

  if (!session) {
    return null
  }

  return {
    currentTimestamp: session.currentTimestamp,
    startTimestamp: session.startTimestamp,
    playbackSpeed: Number(session.playbackSpeed),
    isActive: session.isActive,
  }
}

export async function initializeSimulation(
  userId: string,
  startTimestamp: bigint,
  initialSolBalance: number = 10
): Promise<void> {
  await prisma.userSession.upsert({
    where: { userId },
    update: {
      startTimestamp,
      currentTimestamp: startTimestamp,
      playbackSpeed: 1.0,
      solBalanceStart: initialSolBalance,
      isActive: true,
      updatedAt: new Date(),
    },
    create: {
      userId,
      startTimestamp,
      currentTimestamp: startTimestamp,
      playbackSpeed: 1.0,
      solBalanceStart: initialSolBalance,
      isActive: true,
    },
  })

  // Reset portfolio
  await prisma.userPortfolio.deleteMany({
    where: { userId },
  })

  // Delete user trades
  await prisma.userTrade.deleteMany({
    where: { userId },
  })
}

export async function setSimulationTime(
  userId: string,
  timestamp: bigint
): Promise<void> {
  const session = await prisma.userSession.findUnique({
    where: { userId },
    select: { solBalanceStart: true },
  })

  await initializeSimulation(userId, timestamp, session ? Number(session.solBalanceStart) : 10)
}

export async function setPlaybackSpeed(
  userId: string,
  speed: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const session = await advanceSimulationSession(userId, tx)

    if (!session) {
      await tx.userSession.create({
        data: {
          userId,
          startTimestamp: BigInt(Date.now()),
          currentTimestamp: BigInt(Date.now()),
          playbackSpeed: speed,
          solBalanceStart: 10,
          isActive: speed > 0,
        },
      })
      return
    }

    await tx.userSession.update({
      where: { userId },
      data: {
        playbackSpeed: speed,
        isActive: speed > 0,
        updatedAt: new Date(),
      },
    })
  })
}

export async function getCurrentSimulationTime(userId: string): Promise<bigint | null> {
  const session = await advanceSimulationSession(userId)
  return session?.currentTimestamp ?? null
}

export { advanceSimulationSession }
