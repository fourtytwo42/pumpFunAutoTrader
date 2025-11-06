import EventEmitter from 'eventemitter3'
import { Prisma } from '@prisma/client'
import { upsertTokenStat } from '../../services/repository.js'
import type { NormalizedTrade } from '../../services/repository.js'

interface WindowSummary {
  trades: NormalizedTrade[]
}

interface TokenWindowState {
  lastUpdated: number
  windows: {
    '30s': WindowSummary
    '1m': WindowSummary
    '5m': WindowSummary
  }
}

const LAMPORTS_PER_SOL = 1_000_000_000

function solFromLamports(lamports: bigint) {
  return Number(lamports) / LAMPORTS_PER_SOL
}

function estImpactBps(deltaSol: number, vSol?: number) {
  if (!vSol || vSol <= 0) return null
  const impact = (deltaSol / vSol) * 10_000
  if (!Number.isFinite(impact)) return null
  return Math.max(0, Math.min(5000, impact))
}

export interface TokenStatSnapshot {
  mint: string
  px: number
  priceChange30sPct: number
  volumeSol30s: number
  volumeSol1m: number
  volumeSol5m: number
  buysPerSec: number
  sellsPerSec: number
  buySellImbalance: number
  uniqueTraders30s: number
  uniqueTraders1m: number
  m1vs5mVelocity: number
  estFillBps005?: number | null
  estFillBps010?: number | null
  estFillBps015?: number | null
  vSol?: number
  vTok?: number
  updatedAt: number
}

export declare interface Aggregator {
  on(event: 'stats', listener: (snapshot: TokenStatSnapshot) => void): this
}

export class Aggregator extends EventEmitter {
  private readonly state = new Map<string, TokenWindowState>()
  private readonly latestSnapshots = new Map<string, TokenStatSnapshot>()

  ingestTrade(trade: NormalizedTrade) {
    const state = this.state.get(trade.mint) ?? this.createState(trade.mint)
    const windows = state.windows

    const tradeWithDerived: NormalizedTrade = {
      ...trade,
    }

    windows['30s'].trades.push(tradeWithDerived)
    windows['1m'].trades.push(tradeWithDerived)
    windows['5m'].trades.push(tradeWithDerived)

    this.evictOldTrades(windows['30s'].trades, 30_000, trade.timestampMs)
    this.evictOldTrades(windows['1m'].trades, 60_000, trade.timestampMs)
    this.evictOldTrades(windows['5m'].trades, 300_000, trade.timestampMs)

    const summary = this.calculateSnapshot(trade.mint, state, tradeWithDerived)
    state.lastUpdated = trade.timestampMs
    this.latestSnapshots.set(trade.mint, summary)
    this.emit('stats', summary)
    void upsertTokenStat({
      mint: trade.mint,
      px: summary.px ? new Prisma.Decimal(summary.px) : undefined,
      priceChange30sPct: new Prisma.Decimal(summary.priceChange30sPct ?? 0),
      volumeSol30s: new Prisma.Decimal(summary.volumeSol30s),
      volumeSol1m: new Prisma.Decimal(summary.volumeSol1m),
      volumeSol5m: new Prisma.Decimal(summary.volumeSol5m),
      buysPerSec: new Prisma.Decimal(summary.buysPerSec),
      sellsPerSec: new Prisma.Decimal(summary.sellsPerSec),
      buySellImbalance: new Prisma.Decimal(summary.buySellImbalance),
      uniqueTraders30s: summary.uniqueTraders30s,
      uniqueTraders1m: summary.uniqueTraders1m,
      m1vs5mVelocity: new Prisma.Decimal(summary.m1vs5mVelocity),
      estFillBps005: summary.estFillBps005 ? new Prisma.Decimal(summary.estFillBps005) : undefined,
      estFillBps010: summary.estFillBps010 ? new Prisma.Decimal(summary.estFillBps010) : undefined,
      estFillBps015: summary.estFillBps015 ? new Prisma.Decimal(summary.estFillBps015) : undefined,
      vSol: summary.vSol ? new Prisma.Decimal(summary.vSol) : undefined,
      vTok: summary.vTok ? new Prisma.Decimal(summary.vTok) : undefined,
    })
  }

  private createState(mint: string): TokenWindowState {
    const state: TokenWindowState = {
      lastUpdated: 0,
      windows: {
        '30s': { trades: [] },
        '1m': { trades: [] },
        '5m': { trades: [] },
      },
    }
    this.state.set(mint, state)
    return state
  }

  private evictOldTrades(trades: NormalizedTrade[], windowMs: number, now: number) {
    while (trades.length > 0 && now - trades[0].timestampMs > windowMs) {
      trades.shift()
    }
  }

  private calculateSnapshot(
    mint: string,
    state: TokenWindowState,
    latestTrade: NormalizedTrade
  ): TokenStatSnapshot {
    const trades30s = state.windows['30s'].trades
    const trades1m = state.windows['1m'].trades
    const trades5m = state.windows['5m'].trades

    const px = latestTrade.priceSolPerToken

    const volumeSol30s = trades30s.reduce((acc, trade) => acc + solFromLamports(trade.solAmountLamports), 0)
    const volumeSol1m = trades1m.reduce((acc, trade) => acc + solFromLamports(trade.solAmountLamports), 0)
    const volumeSol5m = trades5m.reduce((acc, trade) => acc + solFromLamports(trade.solAmountLamports), 0)

    const buys30s = trades30s.filter((trade) => trade.isBuy)
    const sells30s = trades30s.filter((trade) => !trade.isBuy)

    const buysPerSec = buys30s.length / 30
    const sellsPerSec = sells30s.length / 30

    const totalVolume1m = trades1m.reduce(
      (acc, trade) => {
        const sol = solFromLamports(trade.solAmountLamports)
        if (trade.isBuy) {
          acc.buy += sol
        } else {
          acc.sell += sol
        }
        return acc
      },
      { buy: 0, sell: 0 }
    )

    const buySellImbalanceDenom = totalVolume1m.buy + totalVolume1m.sell
    const buySellImbalance =
      buySellImbalanceDenom > 0
        ? (totalVolume1m.buy - totalVolume1m.sell) / buySellImbalanceDenom
        : 0

    const traders30s = new Set(trades30s.map((trade) => trade.userAddress).filter(Boolean))
    const traders1m = new Set(trades1m.map((trade) => trade.userAddress).filter(Boolean))

    const buysPerSec1m = trades1m.filter((trade) => trade.isBuy).length / 60
    const buysPerSec5m = trades5m.filter((trade) => trade.isBuy).length / 300
    const m1vs5mVelocity =
      buysPerSec5m > 0 ? buysPerSec1m / buysPerSec5m : buysPerSec1m > 0 ? buysPerSec1m : 0

    const oldestPrice =
      trades30s.length > 0 ? trades30s[0].priceSolPerToken : latestTrade.priceSolPerToken
    const priceChange30sPct =
      oldestPrice > 0 ? ((px - oldestPrice) / oldestPrice) * 100 : 0

    const estFillBps005 = estImpactBps(0.05, latestTrade.vSol)
    const estFillBps010 = estImpactBps(0.1, latestTrade.vSol)
    const estFillBps015 = estImpactBps(0.15, latestTrade.vSol)

    return {
      mint,
      px,
      priceChange30sPct,
      volumeSol30s,
      volumeSol1m,
      volumeSol5m,
      buysPerSec,
      sellsPerSec,
      buySellImbalance,
      uniqueTraders30s: traders30s.size,
      uniqueTraders1m: traders1m.size,
      m1vs5mVelocity,
      estFillBps005,
      estFillBps010,
      estFillBps015,
      vSol: latestTrade.vSol,
      vTok: latestTrade.vTok,
      updatedAt: latestTrade.timestampMs,
    }
  }

  getSnapshot(mint: string): TokenStatSnapshot | null {
    return this.latestSnapshots.get(mint) ?? null
  }
}
