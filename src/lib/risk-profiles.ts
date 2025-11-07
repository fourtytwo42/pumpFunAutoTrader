/**
 * Risk Profile Management System
 * Handles validation, limits, and usage tracking for AI traders
 */

import { prisma } from './db'
import { Decimal } from '@prisma/client/runtime/library'

export interface RiskProfile {
  userId: string
  maxPositionSizeUSD: number
  maxDailySpendUSD: number
  maxSlippageBps: number
  cooldownSeconds: number
  maxConcurrentPositions: number
  minLiquidityUSD: number
  blacklistedTokens: string[]
}

export interface TradeParams {
  mintAddress: string
  side: 'buy' | 'sell'
  amountUSD: number
  slippageBps?: number
}

export interface ExecutedTrade {
  mintAddress: string
  side: 'buy' | 'sell'
  amountUSD: number
  timestamp: Date
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  violations?: string[]
}

/**
 * Get or create risk profile for user
 */
export async function getRiskProfile(userId: string): Promise<RiskProfile> {
  let profile = await prisma.riskProfile.findUnique({
    where: { userId },
  })

  // Create default profile if doesn't exist
  if (!profile) {
    profile = await prisma.riskProfile.create({
      data: { userId },
    })
  }

  return {
    userId: profile.userId,
    maxPositionSizeUSD: Number(profile.maxPositionSizeUSD),
    maxDailySpendUSD: Number(profile.maxDailySpendUSD),
    maxSlippageBps: profile.maxSlippageBps,
    cooldownSeconds: profile.cooldownSeconds,
    maxConcurrentPositions: profile.maxConcurrentPositions,
    minLiquidityUSD: Number(profile.minLiquidityUSD),
    blacklistedTokens: Array.isArray(profile.blacklistedTokens)
      ? (profile.blacklistedTokens as string[])
      : [],
  }
}

/**
 * Update risk profile settings
 */
export async function updateRiskProfile(
  userId: string,
  updates: Partial<Omit<RiskProfile, 'userId'>>
): Promise<RiskProfile> {
  const data: any = {}

  if (updates.maxPositionSizeUSD !== undefined) {
    data.maxPositionSizeUSD = new Decimal(updates.maxPositionSizeUSD)
  }
  if (updates.maxDailySpendUSD !== undefined) {
    data.maxDailySpendUSD = new Decimal(updates.maxDailySpendUSD)
  }
  if (updates.maxSlippageBps !== undefined) {
    data.maxSlippageBps = updates.maxSlippageBps
  }
  if (updates.cooldownSeconds !== undefined) {
    data.cooldownSeconds = updates.cooldownSeconds
  }
  if (updates.maxConcurrentPositions !== undefined) {
    data.maxConcurrentPositions = updates.maxConcurrentPositions
  }
  if (updates.minLiquidityUSD !== undefined) {
    data.minLiquidityUSD = new Decimal(updates.minLiquidityUSD)
  }
  if (updates.blacklistedTokens !== undefined) {
    data.blacklistedTokens = updates.blacklistedTokens
  }

  const profile = await prisma.riskProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  })

  return getRiskProfile(userId)
}

/**
 * Validate a trade against risk profile
 */
export async function validateTrade(
  userId: string,
  trade: TradeParams
): Promise<ValidationResult> {
  const profile = await getRiskProfile(userId)
  const violations: string[] = []

  // Check blacklist
  if (profile.blacklistedTokens.includes(trade.mintAddress)) {
    violations.push(`Token ${trade.mintAddress} is blacklisted`)
  }

  // Check position size (for buys)
  if (trade.side === 'buy' && trade.amountUSD > profile.maxPositionSizeUSD) {
    violations.push(
      `Position size ${trade.amountUSD.toFixed(2)} USD exceeds max ${profile.maxPositionSizeUSD.toFixed(2)} USD`
    )
  }

  // Check slippage
  if (trade.slippageBps && trade.slippageBps > profile.maxSlippageBps) {
    violations.push(
      `Slippage ${trade.slippageBps} bps exceeds max ${profile.maxSlippageBps} bps`
    )
  }

  // Check daily spend limit
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayUsage = await prisma.riskUsage.findFirst({
    where: {
      userId,
      date: {
        gte: today,
      },
    },
  })

  const todaySpent = todayUsage ? Number(todayUsage.spentUSD) : 0

  if (trade.side === 'buy' && todaySpent + trade.amountUSD > profile.maxDailySpendUSD) {
    violations.push(
      `Daily spend ${(todaySpent + trade.amountUSD).toFixed(2)} USD would exceed max ${profile.maxDailySpendUSD.toFixed(2)} USD`
    )
  }

  // Check concurrent positions
  if (trade.side === 'buy') {
    const currentPositions = await prisma.userPortfolio.count({
      where: {
        userId,
        amount: { gt: new Decimal(0.000001) },
      },
    })

    if (currentPositions >= profile.maxConcurrentPositions) {
      violations.push(
        `Already at max concurrent positions (${currentPositions}/${profile.maxConcurrentPositions})`
      )
    }
  }

  // Check cooldown
  if (todayUsage?.lastTradeAt) {
    const timeSinceLastTrade =
      (Date.now() - todayUsage.lastTradeAt.getTime()) / 1000
    if (timeSinceLastTrade < profile.cooldownSeconds) {
      const remaining = Math.ceil(profile.cooldownSeconds - timeSinceLastTrade)
      violations.push(`Cooldown active: ${remaining}s remaining`)
    }
  }

  if (violations.length > 0) {
    return {
      valid: false,
      reason: violations[0],
      violations,
    }
  }

  return { valid: true }
}

/**
 * Record trade execution in usage tracking
 */
export async function updateRiskUsage(
  userId: string,
  trade: ExecutedTrade
): Promise<void> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const existingUsage = await prisma.riskUsage.findFirst({
    where: {
      userId,
      date: {
        gte: today,
      },
    },
  })

  if (existingUsage) {
    await prisma.riskUsage.update({
      where: { id: existingUsage.id },
      data: {
        spentUSD: {
          increment: trade.side === 'buy' ? new Decimal(trade.amountUSD) : 0,
        },
        tradesCount: { increment: 1 },
        lastTradeAt: trade.timestamp,
      },
    })
  } else {
    await prisma.riskUsage.create({
      data: {
        userId,
        date: today,
        spentUSD: trade.side === 'buy' ? new Decimal(trade.amountUSD) : 0,
        tradesCount: 1,
        lastTradeAt: trade.timestamp,
      },
    })
  }
}

/**
 * Get current usage for today
 */
export async function getTodayUsage(userId: string): Promise<{
  spentUSD: number
  tradesCount: number
  lastTradeAt: Date | null
}> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const usage = await prisma.riskUsage.findFirst({
    where: {
      userId,
      date: {
        gte: today,
      },
    },
  })

  if (!usage) {
    return {
      spentUSD: 0,
      tradesCount: 0,
      lastTradeAt: null,
    }
  }

  return {
    spentUSD: Number(usage.spentUSD),
    tradesCount: usage.tradesCount,
    lastTradeAt: usage.lastTradeAt,
  }
}

/**
 * Check if user can trade (cooldown check)
 */
export async function canTrade(userId: string): Promise<{
  canTrade: boolean
  reason?: string
  cooldownRemaining?: number
}> {
  const profile = await getRiskProfile(userId)
  const usage = await getTodayUsage(userId)

  if (!usage.lastTradeAt) {
    return { canTrade: true }
  }

  const timeSinceLastTrade = (Date.now() - usage.lastTradeAt.getTime()) / 1000

  if (timeSinceLastTrade < profile.cooldownSeconds) {
    const remaining = Math.ceil(profile.cooldownSeconds - timeSinceLastTrade)
    return {
      canTrade: false,
      reason: `Cooldown active`,
      cooldownRemaining: remaining,
    }
  }

  return { canTrade: true }
}

