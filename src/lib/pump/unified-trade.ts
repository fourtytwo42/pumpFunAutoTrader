export interface PumpCoinMeta {
  name?: string
  symbol?: string
  uri?: string
  mint?: string
  bondingCurve?: string
  creator?: string
  createdTs?: number
}

export interface PumpUnifiedTrade {
  slotIndexId: string
  tx: string
  timestamp: string
  isBondingCurve: boolean
  program: 'pump' | 'pump_amm' | string
  mintAddress: string
  quoteMintAddress: string
  poolAddress: string
  userAddress: string
  type: 'buy' | 'sell' | string
  marketCap?: string | number
  baseAmount?: string | number
  quoteAmount?: string | number
  amountSol?: string | number
  amountUsd?: string | number
  priceBasePerQuote?: string | number
  priceQuotePerBase?: string | number
  priceUsd?: string | number
  priceSol?: string | number
  protocolFee?: string | number
  protocolFeeUsd?: string | number
  lpFee?: string | number
  lpFeeUsd?: string | number
  creatorAddress?: string
  creatorFee?: string | number
  creatorFeeUsd?: string | number
  coinMeta?: PumpCoinMeta
  [key: string]: unknown
}

/**
 * Pump.fun's unified trade websocket wraps the JSON payload in a quoted JSON string.
 * This helper unwraps the outer string (if present) and parses the resulting object.
 */
export function decodePumpUnifiedTradePayload(rawPayload: string): PumpUnifiedTrade | null {
  let working = rawPayload.trim()

  // Strip wrapping quotes if the payload is delivered as a string literal
  if (working.startsWith('"') && working.endsWith('"')) {
    try {
      working = JSON.parse(working)
    } catch (error) {
      console.error('[pump-feed] Failed to JSON.parse outer payload wrapper:', error)
      return null
    }
  }

  try {
    const parsed = JSON.parse(working) as PumpUnifiedTrade
    return parsed
  } catch (error) {
    console.error('[pump-feed] Failed to parse unified trade payload:', error)
    return null
  }
}

export function normaliseMetadataUri(uri?: string | null): string | null {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://pump.mypinata.cloud/ipfs/')
  }
  return uri
}

