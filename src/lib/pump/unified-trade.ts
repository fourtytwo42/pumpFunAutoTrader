import { Buffer } from 'node:buffer'

let decodeFailureSamples = 0

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
  const originalPayload = rawPayload
  let working = rawPayload.trim()

  // Strip nested wrapping quotes if the payload is delivered as nested JSON strings
  while (working.startsWith('"') && working.endsWith('"')) {
    try {
      const parsed = JSON.parse(working)
      if (typeof parsed !== 'string') {
        working = parsed as unknown as string
        break
      }
      working = parsed
    } catch (error) {
      console.error('[pump-feed] Failed to JSON.parse outer payload wrapper:', error)
      return null
    }
  }

  const attempts: Array<{ label: string; value: string }> = [{ label: 'raw', value: working }]

  const strippedLeading = working.replace(/^[^\[{]+/, '').trim()
  if (strippedLeading && strippedLeading !== working) {
    attempts.push({ label: 'stripped-leading', value: strippedLeading })
  }

  const compact = working.replace(/\s+/g, '')
  if (
    compact.length > 0 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/=]+$/.test(compact) &&
    !working.startsWith('{') &&
    !working.startsWith('[')
  ) {
    try {
      const decoded = Buffer.from(compact, 'base64').toString('utf8').trim()
      if (decoded) {
        attempts.push({ label: 'base64', value: decoded })
        const decodedStripped = decoded.replace(/^[^\[{]+/, '').trim()
        if (decodedStripped && decodedStripped !== decoded) {
          attempts.push({ label: 'base64-stripped-leading', value: decodedStripped })
        }
      }
    } catch (error) {
      console.warn('[pump-feed] Base64 decode attempt failed:', (error as Error).message)
    }
  }

  const seen = new Set<string>(attempts.map((a) => a.value))

  function addAttempt(label: string, value: string) {
    if (!value || seen.has(value)) return
    attempts.push({ label, value })
    seen.add(value)
  }

  if (working.includes('\\"')) {
    const unescaped = working.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    addAttempt('unescaped', unescaped)
  }

  for (let idx = 0; idx < attempts.length; idx += 1) {
    const attempt = attempts[idx]

    if (!attempt.label.startsWith('unescaped') && attempt.value.includes('\\"')) {
      const derived = attempt.value.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      addAttempt(`unescaped-${attempt.label}`, derived)
    }

    try {
      const parsed = JSON.parse(attempt.value) as PumpUnifiedTrade
      return parsed
    } catch (error) {
      const lastClosingBrace = attempt.value.lastIndexOf('}')
      if (lastClosingBrace > 0 && lastClosingBrace < attempt.value.length - 1) {
        const truncated = attempt.value.slice(0, lastClosingBrace + 1)
        try {
          const parsed = JSON.parse(truncated) as PumpUnifiedTrade
          return parsed
        } catch {
          // fallthrough to final error logging
        }
      }
      if (attempt === attempts[attempts.length - 1]) {
        if (decodeFailureSamples < 5) {
          console.error(
            '[pump-feed] raw payload sample:',
            JSON.stringify(originalPayload.slice(0, 200))
          )
          decodeFailureSamples += 1
        }
        console.error(
          '[pump-feed] Failed to parse unified trade payload:',
          (error as Error).message,
          `attempt=${attempt.label}`,
          attempt.value.slice(0, 200)
        )
      }
    }
  }

  return null
}

export function normaliseMetadataUri(uri?: string | null): string | null {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://pump.mypinata.cloud/ipfs/')
  }
  return uri
}

