import EventEmitter from 'eventemitter3'
import { io, Socket } from 'socket.io-client'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import { saveTrades } from '../../services/repository.js'
import type { Aggregator } from '../agg/aggregator.js'
import type { NormalizedTrade } from '../../services/repository.js'

export interface TradeIngestorOptions {
  reconnectDelayMs?: number
  forwardToDb?: boolean
}

type TradePayload = {
  mint: string
  signature: string
  tx_index: number
  slot: number
  is_buy: boolean
  sol_amount: string | number
  token_amount: string | number
  timestamp: number
  created_timestamp?: number
  virtual_sol_reserves?: string | number
  virtual_token_reserves?: string | number
  user?: string
}

export declare interface TradeIngestor {
  on(event: 'trade', listener: (trade: NormalizedTrade) => void): this
  on(event: 'connected', listener: () => void): this
  on(event: 'disconnected', listener: () => void): this
}

export class TradeIngestor extends EventEmitter {
  private socket: Socket | null = null
  private reconnecting = false
  private readonly options: Required<TradeIngestorOptions>

  constructor(
    private readonly aggregator: Aggregator,
    options: TradeIngestorOptions = {}
  ) {
    super()
    this.options = {
      reconnectDelayMs: options.reconnectDelayMs ?? 5_000,
      forwardToDb: options.forwardToDb ?? true,
    }
  }

  start() {
    if (this.socket) {
      return
    }

    const uri = config.wsUrl.startsWith('wss')
      ? config.wsUrl.replace('wss://', 'https://').replace('ws://', 'http://')
      : config.wsUrl

    this.socket = io(uri, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: {
        Origin: config.pumpFunOrigin,
      },
    })

    this.socket.on('connect', () => {
      logger.info({ id: this.socket?.id }, 'Pump.fun WS connected')
      this.reconnecting = false
      this.emit('connected')
    })

    this.socket.on('disconnect', (reason) => {
      logger.warn({ reason }, 'Pump.fun WS disconnected')
      this.emit('disconnected')
      this.scheduleReconnect()
    })

    this.socket.on('connect_error', (error) => {
      logger.error({ error }, 'Pump.fun WS connection error')
      this.scheduleReconnect()
    })

    this.socket.on('tradeCreated', (payload: TradePayload) => {
      const trade = this.normalizeTrade(payload)
      if (!trade) return
      this.emit('trade', trade)
      this.aggregator.ingestTrade(trade)
      if (this.options.forwardToDb) {
        void saveTrades([trade])
      }
    })
  }

  stop() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  private scheduleReconnect() {
    if (this.reconnecting) return
    this.reconnecting = true
    setTimeout(() => {
      logger.info('Attempting to reconnect Pump.fun WS')
      this.stop()
      this.start()
    }, this.options.reconnectDelayMs)
  }

  private normalizeTrade(payload: TradePayload): NormalizedTrade | null {
    try {
      const solAmountLamports = BigInt(payload.sol_amount)
      if (!Number.isFinite(Number(payload.token_amount))) {
        return null
      }
      const tokenAmount = Number(payload.token_amount)

      const timestampMs =
        payload.created_timestamp && payload.created_timestamp > 10_000
          ? Number(payload.created_timestamp)
          : payload.timestamp * 1000

      return {
        signature: payload.signature,
        txIndex: payload.tx_index,
        slot: payload.slot,
        mint: payload.mint,
        isBuy: payload.is_buy,
        solAmountLamports,
        tokenAmount,
        priceSolPerToken:
          tokenAmount > 0 ? Number(solAmountLamports) / 1_000_000_000 / tokenAmount : 0,
        userAddress: payload.user,
        timestampMs,
        vSol: payload.virtual_sol_reserves
          ? Number(payload.virtual_sol_reserves) / 1_000_000_000
          : undefined,
        vTok: payload.virtual_token_reserves ? Number(payload.virtual_token_reserves) : undefined,
      }
    } catch (error) {
      logger.warn({ payload, error }, 'Failed to normalize trade payload')
      return null
    }
  }
}
