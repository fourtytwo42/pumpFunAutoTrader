import { NextRequest, NextResponse } from 'next/server'
import { searchTokens as pumpSearchTokens } from '@/lib/pump-api'

type CacheEntry = {
  timestamp: number
  results: Awaited<ReturnType<typeof pumpSearchTokens>>
}

const searchCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 60_000

function buildCacheKey(term: string, limit: number, includeNsfw: boolean) {
  return `${term.toLowerCase()}::${limit}::${includeNsfw ? 'nsfw' : 'sfw'}`
}

export async function GET(request: NextRequest) {
  const term = request.nextUrl.searchParams.get('term')?.trim() ?? ''
  const limitParam = request.nextUrl.searchParams.get('limit')
  const includeNsfwParam = request.nextUrl.searchParams.get('includeNsfw')

  if (term.length < 2) {
    return NextResponse.json({ term, results: [] })
  }

  const limit = Math.min(Math.max(Number(limitParam) || 10, 1), 50)
  const includeNsfw =
    includeNsfwParam === 'true' || includeNsfwParam === '1' || includeNsfwParam === 'yes'

  const cacheKey = buildCacheKey(term, limit, includeNsfw)
  const cached = searchCache.get(cacheKey)
  const now = Date.now()

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ term, results: cached.results, cached: true })
  }

  try {
    const results = await pumpSearchTokens(term, {
      limit,
      includeNsfw,
    })

    searchCache.set(cacheKey, {
      timestamp: now,
      results,
    })

    return NextResponse.json({ term, results, cached: false })
  } catch (error) {
    console.error('[pump-search] proxy failed:', (error as Error).message)
    return NextResponse.json(
      { error: 'Failed to fetch search results' },
      { status: 502 }
    )
  }
}

