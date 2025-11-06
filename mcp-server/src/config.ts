import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv()

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PUMPFUN_WS_URL: z
    .string()
    .default('wss://frontend-api-v3.pump.fun/socket.io/?EIO=4&transport=websocket'),
  PUMPFUN_ORIGIN: z.string().default('https://pump.fun'),
  PUMPFUN_DISCOVERY_URL: z.string().default('https://frontend-api-v3.pump.fun/coins/for-you'),
  PUMPFUN_SWAP_API_URL: z.string().default('https://swap-api.pump.fun'),
  PUMPFUN_ADVANCED_API_URL: z
    .string()
    .default('https://advanced-api-v2.pump.fun/coins/top-holders-and-sol-balance'),
  SOL_PRICE_URL: z.string().default('https://frontend-api-v3.pump.fun/sol-price'),
  HELIUS_RPC_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  CACHE_KV_TTL_SECONDS: z
    .string()
    .optional()
    .transform((value) => (value ? Number.parseInt(value, 10) : undefined)),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  console.error('Invalid environment configuration', parsedEnv.error.flatten())
  throw new Error('Invalid environment configuration')
}

const env = parsedEnv.data

export const config = {
  databaseUrl: env.DATABASE_URL,
  wsUrl: env.PUMPFUN_WS_URL,
  pumpFunOrigin: env.PUMPFUN_ORIGIN,
  pumpFunDiscoveryUrl: env.PUMPFUN_DISCOVERY_URL,
  pumpFunSwapApiUrl: env.PUMPFUN_SWAP_API_URL,
  pumpFunAdvancedApiUrl: env.PUMPFUN_ADVANCED_API_URL,
  solPriceUrl: env.SOL_PRICE_URL,
  heliusRpcUrl: env.HELIUS_RPC_URL,
  logLevel: env.LOG_LEVEL,
  cacheKvTtlSeconds: env.CACHE_KV_TTL_SECONDS ?? 300,
}

export type AppConfig = typeof config
