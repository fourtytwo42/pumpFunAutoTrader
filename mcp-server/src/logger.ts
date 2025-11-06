import pino from 'pino'
import { config } from './config.js'

export const logger = pino({
  level: config.logLevel,
  base: undefined,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
})

export type Logger = typeof logger
