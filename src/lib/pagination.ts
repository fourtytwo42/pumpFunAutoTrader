/**
 * Pagination Utilities
 * Helpers for paginated database queries and API responses
 */

export interface PaginatedRequest {
  limit: number
  cursor?: string
  offset?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  nextCursor?: string
  hasMore: boolean
  total?: number
}

/**
 * Create pagination parameters with defaults and validation
 */
export function parsePaginationParams(params: {
  limit?: string | number
  cursor?: string
  offset?: string | number
}): PaginatedRequest {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 500)
  const cursor = params.cursor || undefined
  const offset = params.offset ? Math.max(Number(params.offset) || 0, 0) : undefined

  return { limit, cursor, offset }
}

/**
 * Build paginated response object
 */
export function buildPaginatedResponse<T>(
  data: T[],
  limit: number,
  options: {
    total?: number
    getCursor?: (item: T) => string
  } = {}
): PaginatedResponse<T> {
  const hasMore = data.length > limit
  const items = hasMore ? data.slice(0, limit) : data

  let nextCursor: string | undefined
  if (hasMore && items.length > 0 && options.getCursor) {
    nextCursor = options.getCursor(items[items.length - 1])
  }

  return {
    data: items,
    nextCursor,
    hasMore,
    total: options.total,
  }
}

/**
 * Helper for cursor-based Prisma queries
 */
export function buildPrismaCursor<T extends { id: string }>(
  cursor?: string
): { cursor?: { id: string }; skip?: number } {
  if (!cursor) return {}

  return {
    cursor: { id: cursor },
    skip: 1, // Skip the cursor item itself
  }
}

/**
 * Helper for offset-based Prisma queries
 */
export function buildPrismaOffset(offset?: number): { skip?: number } {
  if (offset === undefined || offset === 0) return {}

  return { skip: offset }
}

/**
 * Calculate total pages from total items
 */
export function calculateTotalPages(totalItems: number, limit: number): number {
  return Math.ceil(totalItems / limit)
}

/**
 * Calculate current page from offset and limit
 */
export function calculateCurrentPage(offset: number, limit: number): number {
  return Math.floor(offset / limit) + 1
}

/**
 * Date range pagination helper
 */
export interface DateRangePagination {
  startDate: Date
  endDate: Date
  limit: number
}

export function parseDateRange(params: {
  startDate?: string | Date
  endDate?: string | Date
  limit?: number
}): DateRangePagination {
  const now = new Date()
  const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago

  let startDate = defaultStart
  if (params.startDate) {
    const parsed = typeof params.startDate === 'string' ? new Date(params.startDate) : params.startDate
    if (!isNaN(parsed.getTime())) {
      startDate = parsed
    }
  }

  let endDate = now
  if (params.endDate) {
    const parsed = typeof params.endDate === 'string' ? new Date(params.endDate) : params.endDate
    if (!isNaN(parsed.getTime())) {
      endDate = parsed
    }
  }

  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 500)

  return { startDate, endDate, limit }
}

/**
 * Time-series pagination (for trades, events, etc.)
 */
export interface TimeSeriesPagination {
  beforeTimestamp?: number
  afterTimestamp?: number
  limit: number
}

export function parseTimeSeriesParams(params: {
  before?: string | number
  after?: string | number
  limit?: string | number
}): TimeSeriesPagination {
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 500)
  
  const beforeTimestamp = params.before 
    ? typeof params.before === 'string' 
      ? Number(params.before) 
      : params.before
    : undefined

  const afterTimestamp = params.after
    ? typeof params.after === 'string'
      ? Number(params.after)
      : params.after
    : undefined

  return {
    beforeTimestamp,
    afterTimestamp,
    limit,
  }
}

