import { prisma } from './db'

export interface SimulationState {
  currentTimestamp: bigint
  startTimestamp: bigint
  playbackSpeed: number
  isActive: boolean
}

export async function getSimulationState(userId: string): Promise<SimulationState | null> {
  const session = await prisma.userSession.findUnique({
    where: { userId },
  })

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
  await initializeSimulation(userId, timestamp)
}

export async function setPlaybackSpeed(
  userId: string,
  speed: number
): Promise<void> {
  await prisma.userSession.update({
    where: { userId },
    data: {
      playbackSpeed: speed,
      updatedAt: new Date(),
    },
  })
}

export async function getCurrentSimulationTime(userId: string): Promise<bigint | null> {
  const session = await prisma.userSession.findUnique({
    where: { userId },
    select: { currentTimestamp: true },
  })
  return session?.currentTimestamp ?? null
}

