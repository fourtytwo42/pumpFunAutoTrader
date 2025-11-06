export interface TokenBucketOptions {
  capacity: number
  refillRate: number // tokens per second
}

export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.capacity
    this.lastRefill = Date.now()
  }

  private refill() {
    const now = Date.now()
    const elapsedSeconds = (now - this.lastRefill) / 1000
    if (elapsedSeconds <= 0) return

    const refillAmount = elapsedSeconds * this.options.refillRate
    this.tokens = Math.min(this.options.capacity, this.tokens + refillAmount)
    this.lastRefill = now
  }

  async consume(tokens = 1): Promise<void> {
    this.refill()

    if (tokens <= this.tokens) {
      this.tokens -= tokens
      return
    }

    const deficit = tokens - this.tokens
    const waitMs = (deficit / this.options.refillRate) * 1000
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    this.tokens = Math.max(0, this.tokens - tokens)
  }
}

export class RateLimiterRegistry {
  private readonly buckets = new Map<string, TokenBucket>()

  register(key: string, options: TokenBucketOptions) {
    this.buckets.set(key, new TokenBucket(options))
  }

  get(key: string): TokenBucket {
    const bucket = this.buckets.get(key)
    if (!bucket) {
      throw new Error(`Rate limiter not registered: ${key}`)
    }
    return bucket
  }
}
