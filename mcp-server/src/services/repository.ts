import { Prisma, type TokenStat } from '@prisma/client'
import { prisma } from '../db.js'

export interface NormalizedTrade {
  signature: string
  txIndex: number
  slot: number
  mint: string
  isBuy: boolean
  solAmountLamports: bigint
  tokenAmount: number
  priceSolPerToken: number
  userAddress?: string
  timestampMs: number
  vSol?: number
  vTok?: number
}

export async function saveTrades(trades: NormalizedTrade[]): Promise<void> {
  if (trades.length === 0) return

  await prisma.$transaction(async (tx) => {
    for (const trade of trades) {
      await tx.trade.upsert({
        where: { txSignature: trade.signature },
        update: {},
        create: {
          txSignature: trade.signature,
          token: {
            connectOrCreate: {
              where: { mintAddress: trade.mint },
              create: {
                mintAddress: trade.mint,
                symbol: trade.mint.slice(0, 4),
                name: trade.mint,
                creatorAddress: trade.userAddress ?? 'unknown',
                totalSupply: new Prisma.Decimal(trade.tokenAmount),
                createdAt: BigInt(trade.timestampMs),
                completed: false,
              },
            },
          },
          txIndex: trade.txIndex,
          slot: trade.slot,
          type: trade.isBuy ? 1 : 2,
          amountSol: new Prisma.Decimal(Number(trade.solAmountLamports) / 1_000_000_000),
          amountUsd: new Prisma.Decimal(0),
          baseAmount: new Prisma.Decimal(trade.tokenAmount),
          priceSol: new Prisma.Decimal(trade.priceSolPerToken),
          timestamp: BigInt(trade.timestampMs),
          userAddress: trade.userAddress,
        },
      })
    }
  })
}

export async function upsertTokenStat(update: Partial<TokenStat> & { mint: string }) {
  await prisma.token.upsert({
    where: { mintAddress: update.mint },
    update: {},
    create: {
      mintAddress: update.mint,
      symbol: update.mint.slice(0, 4),
      name: update.mint,
      creatorAddress: 'unknown',
      totalSupply: new Prisma.Decimal(0),
      createdAt: BigInt(Date.now()),
      completed: false,
    },
  })

  await prisma.tokenStat.upsert({
    where: { mint: update.mint },
    update,
    create: {
      mint: update.mint,
      ...update,
    },
  })
}

export async function getTokenStatByMint(mint: string) {
  return prisma.tokenStat.findUnique({
    where: { mint },
  })
}

export async function listWatchlistMints(): Promise<string[]> {
  const rows = await prisma.agentWatchlist.findMany({
    where: { enabled: true },
    select: { mint: true },
  })
  return rows.map((row) => row.mint)
}
