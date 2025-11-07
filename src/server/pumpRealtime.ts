import WebSocket from 'ws'
import { eventBus } from '@/lib/events'
import { decodePumpUnifiedTradePayload, PumpUnifiedTrade } from '@/lib/pump/unified-trade'

const NATS_URL = 'wss://unified-prod.nats.realtime.pump.fun/'
const HEADERS = {
  Origin: 'https://pump.fun',
  'User-Agent': 'pump-feed-relay/1.0',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}
const CONNECT_PAYLOAD = {
  no_responders: true,
  protocol: 1,
  verbose: false,
  pedantic: false,
  user: 'subscriber',
  pass: 'OX745xvUbNQMuFqV',
  lang: 'nats.ws',
  version: '1.30.3',
  headers: true,
}
const SUBJECTS = ['unifiedTradeEvent.processed']

let started = false
let ws: WebSocket | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let buffer = ''

function normalizeTrade(trade: PumpUnifiedTrade) {
  return {
    mint: trade.mintAddress,
    tx: trade.tx,
    type: trade.type,
    timestamp: trade.timestamp,
    program: trade.program,
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 2000)
}

function processBuffer() {
  while (buffer.length > 0) {
    if (buffer.startsWith('PING')) {
      ws?.send('PONG\r\n')
      const newline = buffer.indexOf('\r\n')
      buffer = newline === -1 ? '' : buffer.slice(newline + 2)
      continue
    }

    if (buffer.startsWith('PONG') || buffer.startsWith('+OK')) {
      const newline = buffer.indexOf('\r\n')
      buffer = newline === -1 ? '' : buffer.slice(newline + 2)
      continue
    }

    if (buffer.startsWith('INFO')) {
      const newline = buffer.indexOf('\r\n')
      if (newline === -1) return
      buffer = buffer.slice(newline + 2)
      continue
    }

    if (!buffer.startsWith('MSG')) {
      const newline = buffer.indexOf('\r\n')
      buffer = newline === -1 ? '' : buffer.slice(newline + 2)
      continue
    }

    const headerEnd = buffer.indexOf('\r\n')
    if (headerEnd === -1) return
    const header = buffer.slice(0, headerEnd)
    const parts = header.split(' ')
    if (parts.length < 4) {
      buffer = buffer.slice(headerEnd + 2)
      continue
    }
    const size = Number(parts[3])
    const totalLength = headerEnd + 2 + size + 2
    if (buffer.length < totalLength) return

    const payload = buffer.slice(headerEnd + 2, headerEnd + 2 + size)
    buffer = buffer.slice(totalLength)

    const trade = decodePumpUnifiedTradePayload(payload)
    if (trade) {
      eventBus.emitEvent({ type: 'trade:new', payload: normalizeTrade(trade) })
    }
  }
}

function connect() {
  ws = new WebSocket(NATS_URL, { headers: HEADERS })

  ws.once('open', () => {
    buffer = ''
    ws?.send(`CONNECT ${JSON.stringify(CONNECT_PAYLOAD)}\r\n`)
    ws?.send('PING\r\n')
    SUBJECTS.forEach((subject, idx) => {
      ws?.send(`SUB ${subject} relay${idx}\r\n`)
    })
  })

  ws.on('message', (data) => {
    buffer += data.toString()
    processBuffer()
  })

  ws.on('close', () => {
    scheduleReconnect()
  })

  ws.on('error', () => {
    ws?.close()
  })
}

export function ensurePumpRealtime() {
  if (started) return
  started = true
  connect()
}

