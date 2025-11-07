#!/usr/bin/env node

/*
 * Quick connectivity check against Pump.fun's live trades websocket feed.
 *
 * Usage:
 *   node scripts/check-trades-websocket.js
 *
 * The script connects via socket.io, waits for the first `tradeCreated` event,
 * logs a short summary, then disconnects. It will timeout after 15 seconds if
 * nothing is received.
 */

const { io } = require('socket.io-client')

const SOCKET_URL = 'https://frontend-api-v3.pump.fun'
const SOCKET_PATH = '/socket.io/'
const TIMEOUT_MS = 15_000

console.log('[pump.fun] Connecting to trades websocket…')

const socket = io(SOCKET_URL, {
  path: SOCKET_PATH,
  transports: ['websocket'],
  reconnection: false,
})

let timeout

function shutdown(code) {
  if (timeout) clearTimeout(timeout)
  if (socket.connected) socket.disconnect()
  process.exit(code)
}

socket.on('connect', () => {
  console.log(`[pump.fun] Connected (socket id: ${socket.id})`)

  timeout = setTimeout(() => {
    console.error('[pump.fun] No trade events received within timeout window.')
    shutdown(1)
  }, TIMEOUT_MS)
})

socket.on('connect_error', (err) => {
  console.error('[pump.fun] Connection error:', err.message)
  shutdown(1)
})

socket.on('tradeCreated', (payload = {}) => {
  if (timeout) clearTimeout(timeout)

  const mint = payload.mint || 'unknown mint'
  const sol = payload.sol_amount ?? payload.amountSol ?? 'n/a'
  const isBuy = payload.is_buy ?? payload.side === 1

  console.log('[pump.fun] tradeCreated event received:')
  console.log(`  mint        : ${mint}`)
  console.log(`  side        : ${isBuy ? 'BUY' : 'SELL'}`)
  console.log(`  sol amount  : ${sol}`)
  console.log(`  timestamp   : ${payload.timestamp ?? 'n/a'}`)

  shutdown(0)
})

socket.on('disconnect', (reason) => {
  console.log(`[pump.fun] Disconnected (${reason})`)
})

