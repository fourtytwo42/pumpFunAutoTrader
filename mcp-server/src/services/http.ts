import { setTimeout as delay } from 'node:timers/promises'
import { cacheGet, cacheSet } from './cache.js'
import { RateLimiterRegistry } from './rateLimiter.js'
import { logger } from '../logger.js'

const limiter = new RateLimiterRegistry()

limiter.register('frontend-api-v3.pump.fun', {
  capacity: 60,
  refillRate: 1,
})
limiter.register('swap-api.pump.fun', {
  capacity: 100,
  refillRate: 2,
})
limiter.register('advanced-api-v2.pump.fun', {
  capacity: 60,
  refillRate: 1,
})

export interface FetchJsonOptions {
  ttlMs?: number
  cacheKey?: string
  headers?: Record<string, string>
  retry?: number
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  options: FetchJsonOptions = {}
): Promise<T | null> {
  const { ttlMs, cacheKey, headers, retry = 3 } = options
  const key = cacheKey ?? (ttlMs ? `${url}:${JSON.stringify(init)}` : undefined)

  if (ttlMs && key) {
    const cached = await cacheGet<T>(key)
    if (cached) {
      return cached
    }
  }

  const parsedUrl = new URL(url)
  const limiterKey = parsedUrl.host

  try {
    const bucket = limiter.get(limiterKey)
    await bucket.consume()
  } catch (error) {
    logger.warn({ limiterKey, error }, 'Rate limiter missing; proceeding without throttle')
  }

  let lastError: unknown

  for (let attempt = 0; attempt < retry; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          accept: 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': 'PumpFunMcp/1.0',
          ...headers,
        },
      })

      if (response.status === 304 && ttlMs && key) {
        const cached = await cacheGet<T>(key)
        if (cached) {
          return cached
        }
      }

      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} ${response.statusText}`)
        if (response.status >= 500 || response.status === 429) {
          await delay(250 * (attempt + 1))
          continue
        }
        logger.warn({ url, status: response.status }, 'Request failed without retry')
        return null
      }

      const data = (await response.json()) as T
      if (ttlMs && key) {
        await cacheSet(key, data, ttlMs)
      }
      return data
    } catch (error) {
      lastError = error
      logger.warn({ url, attempt, error }, 'Request attempt failed')
      await delay(250 * (attempt + 1))
    }
  }

  logger.error({ url, lastError }, 'Failed to fetch JSON after retries')
  return null
}
