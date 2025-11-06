import LRU from 'lru-cache'
import { prisma } from '../db.js'
import { logger } from '../logger.js'

export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const memoryCache = new LRU<string, CacheEntry<unknown>>({
  max: 500,
})

async function hydrateFromDb(key: string): Promise<CacheEntry<unknown> | null> {
  try {
    const row = await prisma.cacheEntry.findUnique({
      where: { key },
    })
    if (!row) {
      return null
    }

    const expiresAt = row.expiresAt.getTime()
    if (expiresAt < Date.now()) {
      await prisma.cacheEntry.delete({ where: { key } })
      return null
    }

    const entry: CacheEntry<unknown> = {
      value: JSON.parse(row.value),
      expiresAt,
    }
    memoryCache.set(key, entry, { ttl: expiresAt - Date.now() })
    return entry
  } catch (error) {
    logger.warn({ error }, 'Failed to hydrate cache from DB')
    return null
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const entry = memoryCache.get(key)
  if (entry) {
    if (entry.expiresAt < Date.now()) {
      memoryCache.delete(key)
      return null
    }
    return entry.value as T
  }

  const hydrated = await hydrateFromDb(key)
  return hydrated ? (hydrated.value as T) : null
}

export async function cacheSet<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs
  const entry: CacheEntry<T> = {
    value,
    expiresAt,
  }
  memoryCache.set(key, entry, { ttl: ttlMs })

  try {
    await prisma.cacheEntry.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        expiresAt: new Date(expiresAt),
      },
      create: {
        key,
        value: JSON.stringify(value),
        expiresAt: new Date(expiresAt),
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to persist cache entry')
  }
}
