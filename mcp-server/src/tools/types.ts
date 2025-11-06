export interface DiscoverUniverseInput {
  filters?: {
    marketCapMinUSD?: number
    marketCapMaxUSD?: number
    volume24hMinUSD?: number
    volume24hMaxUSD?: number
    includeNsfw?: boolean
  }
  limit?: number
}

export interface TokenStatsInput {
  mint: string
}

export interface RecentTradesInput {
  mint: string
  minSol?: number
  limit?: number
  cursor?: string
}

export interface HoldersSnapshotInput {
  mint: string
  thresholdSol?: number
}

export interface MarketActivityInput {
  pool: string
  windows: string[]
}

export interface CandlesInput {
  mint: string
  limit?: number
  interval?: '1m' | '5m' | '1h'
}

export interface PoolStateInput {
  accounts: string[]
}

export interface WatchlistInput {
  op: 'UPSERT' | 'DELETE' | 'LIST'
  items?: Array<{
    mint: string
    maxEntrySol?: number
    minUsers1m?: number
    maxImpactBps?: number
  }>
}

export interface PortfolioInput {
  op: 'SNAPSHOT'
}

export interface RulesEngineInput {
  op: 'UPSERT' | 'DELETE' | 'LIST'
  rules?: Array<{
    id: string
    expr: unknown
    scope?: { mint: string }
    cooldownSec?: number
  }>
}

export interface ExecTradeInput {
  side: 'BUY' | 'SELL'
  mint: string
  amountSol?: number
  amountTokens?: number
  slippageBps: number
  postOnly?: boolean
  clientId: string
}
