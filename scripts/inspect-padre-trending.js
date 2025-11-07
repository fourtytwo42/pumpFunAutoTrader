#!/usr/bin/env node

/*
 * Inspect the Padre /trending websocket feed.
 *
 * Connects to wss://backend2.padre.gg/_heavy_multiplex, captures a handful of
 * messages, attempts to decode (base64, zlib, brotli, msgpack, JSON), and
 * prints a structured summary. Supports sending the same auth + subscription
 * frames that the browser issues so we can see real token/trade payloads.
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { WebSocket } = require('ws')
const zlib = require('zlib')
const { decode: msgpackDecode, encode: msgpackEncode } = require('@msgpack/msgpack')

const DEFAULT_WS_URL = 'wss://unified-prod.nats.realtime.pump.fun/'
const DEFAULT_PROTOCOL = 'pump'
const DEFAULT_SUBS = ['unifiedTradeEvent.processed']
const MAX_MESSAGES = 50
const REQUIRED_INTERESTING = 3
const TIMEOUT_MS = 30_000

// --- CLI / ENV configuration -------------------------------------------------
const argv = process.argv.slice(2)
const options = {}
for (const arg of argv) {
  if (!arg.startsWith('--')) continue
  const body = arg.slice(2)
  const eq = body.indexOf('=')
  const key = eq === -1 ? body : body.slice(0, eq)
  const rawValue = eq === -1 ? undefined : body.slice(eq + 1)
  const value = rawValue === undefined ? true : rawValue
  if (options[key]) {
    if (!Array.isArray(options[key])) options[key] = [options[key]]
    options[key].push(value)
  } else {
    options[key] = value
  }
}

const wsUrl = options.url || process.env.PADRE_WS_URL || DEFAULT_WS_URL
const userId = options.user || process.env.PADRE_USER
const extraSubs = options.sub
const cookieHeader = options.cookie || process.env.PADRE_COOKIE
const durationSeconds = Number(options.duration || process.env.PADRE_DURATION || 60)
const logPath =
  options.log ||
  process.env.PADRE_LOG ||
  path.resolve(process.cwd(), `padre-ws-log-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
const handshakeBase64 = options.handshake || process.env.PADRE_HANDSHAKE
const protocol = options.protocol || process.env.PADRE_PROTOCOL || DEFAULT_PROTOCOL

let jwt = options.jwt || process.env.PADRE_JWT
let sessionId = options.session || process.env.PADRE_SESSION

if (handshakeBase64 && protocol === 'padre') {
  try {
    const buffer = Buffer.from(handshakeBase64, 'base64')
    const decoded = msgpackDecode(buffer)
    if (Array.isArray(decoded) && decoded.length >= 3) {
      if (!jwt) jwt = decoded[1]
      if (!sessionId) sessionId = decoded[2]
    }
  } catch (error) {
    console.warn('[padre] Failed to decode handshake base64 payload:', error.message)
  }
}

if (protocol === 'padre') {
  if (!jwt || !sessionId) {
    console.error('[padre] Missing credentials. Provide --jwt and --session (or PADRE_JWT / PADRE_SESSION env vars).')
    console.error('        Example: node scripts/pump-ws-inspect.js --jwt="<token>" --session="dc3c..." --user="w_..."')
    process.exit(1)
  }
}

function buildPumpMessages(subs) {
  const connectPayload = {
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
  const messages = [
    Buffer.from(`CONNECT ${JSON.stringify(connectPayload)}\r\n`, 'utf8'),
  ]
  messages.push(Buffer.from('PING\r\n', 'utf8'))
  subs.forEach((subject) => {
    const sid = crypto.randomBytes(8).toString('hex')
    messages.push(Buffer.from(`SUB ${subject} ${sid}\r\n`, 'utf8'))
  })
  return messages
}

const DEFAULT_SUBSCRIPTIONS =
  protocol === 'padre'
    ? [
        '/padre-news/news/all/current-version',
        userId && `/twitter/tweet/subscribe-feed/v3/${userId}?encodedCategoryFilters=&onlySubscribedAccounts=1`,
        userId && `/orders/users/${userId}/subscribe-orders?limit=1`,
        userId && `/watchlist/users/${userId}/on-watchlist-update`,
      ].filter(Boolean)
    : DEFAULT_SUBS

const combinedSubs = DEFAULT_SUBSCRIPTIONS.concat(
  extraSubs ? (Array.isArray(extraSubs) ? extraSubs : [extraSubs]) : [],
)

const subscriptionEnvelope =
  protocol === 'padre'
    ? combinedSubs.map((path, index) => [4, 100 + index, path])
    : buildPumpMessages(combinedSubs)

const results = []
let interestingCount = 0
let timeout
let durationTimer
const logStream = fs.createWriteStream(logPath, { flags: 'a' })

function isPrintable(str) {
  if (!str) return false
  const printable = str.replace(/[\x20-\x7E\s]/g, '')
  return printable.length / str.length < 0.2
}

function summariseValue(value, depth = 0) {
  if (depth > 2) return '[depth limit]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (value.length > 200) {
      return `${value.slice(0, 200)}… (len=${value.length})`
    }
    return value
  }
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      sample: value.slice(0, 5).map((item) => summariseValue(item, depth + 1)),
    }
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    const sample = {}
    keys.slice(0, 10).forEach((key) => {
      sample[key] = summariseValue(value[key], depth + 1)
    })
    return { type: 'object', keys, sample }
  }
  return value
}

function tryDecompression(label, buffer) {
  const attempts = []
  const methods = [
    { label: `${label}-inflate`, fn: zlib.inflateSync },
    { label: `${label}-gunzip`, fn: zlib.gunzipSync },
    { label: `${label}-unzip`, fn: zlib.unzipSync },
    { label: `${label}-brotli`, fn: zlib.brotliDecompressSync },
  ]

  for (const method of methods) {
    try {
      const out = method.fn(buffer)
      attempts.push(analyseBuffer(method.label, out))
    } catch (_) {
      // ignore
    }
  }
  return attempts
}

function analyseBuffer(label, buffer) {
  const info = {
    label,
    size: buffer.length,
    hexPreview: buffer.slice(0, 16).toString('hex'),
  }

  const text = buffer.toString('utf8')
  if (isPrintable(text)) {
    info.asTextPreview = text.slice(0, 400)
    try {
      const json = JSON.parse(text)
      info.json = summariseValue(json)
    } catch (_) {
      // not JSON
    }
  }

  try {
    const decoded = msgpackDecode(buffer)
    info.msgpack = summariseValue(decoded)
  } catch (_) {
    // not msgpack at this stage
  }

  return info
}

function analyseMessage(rawData) {
  const entry = {
    receivedAt: new Date().toISOString(),
    typeof: typeof rawData,
  }

  let buffer

  if (typeof rawData === 'string') {
    const trimmed = rawData.trim()
    entry.rawPreview = trimmed.slice(0, 80)
    entry.rawLength = trimmed.length
    const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0
    entry.looksBase64 = looksBase64
    buffer = looksBase64 ? Buffer.from(trimmed, 'base64') : Buffer.from(trimmed)
  } else if (Buffer.isBuffer(rawData)) {
    buffer = rawData
    entry.rawLength = rawData.length
    entry.rawPreview = rawData.slice(0, 16).toString('hex')
  } else if (rawData instanceof ArrayBuffer) {
    buffer = Buffer.from(rawData)
    entry.rawLength = buffer.length
    entry.rawPreview = buffer.slice(0, 16).toString('hex')
  } else {
    buffer = Buffer.from(rawData)
    entry.rawLength = buffer.length
    entry.rawPreview = buffer.slice(0, 16).toString('hex')
  }

  entry.analysis = [analyseBuffer('raw', buffer)]
  entry.analysis.push(...tryDecompression('raw', buffer))

  // If base64, also attempt analysis on the UTF8 text directly
  if (entry.looksBase64) {
    const text = buffer.toString('utf8')
    if (isPrintable(text)) {
      entry.plainText = text.slice(0, 400)
    }
  }

  return { entry, buffer }
}

function finalizeAndExit(code) {
  if (timeout) clearTimeout(timeout)
  if (durationTimer) clearTimeout(durationTimer)
  if (logStream) logStream.end()
  console.log('\n=== Padre /trending websocket analysis ===')
  console.log(
    JSON.stringify(
      {
        wsUrl,
        messageCount: results.length,
        interestingCount,
        messages: results,
        logPath,
      },
      null,
      2,
    ),
  )
  process.exit(code)
}

function sendMsgpack(ws, payload) {
  try {
    const encoded = msgpackEncode(payload)
    ws.send(encoded)
  } catch (error) {
    console.error('[padre] Failed to encode/send payload', payload, error)
  }
}

function main() {
  console.log(`[padre] Connecting to ${wsUrl}`)

  const headers =
    protocol === 'padre'
      ? {
          Origin: 'https://trade.padre.gg',
          'User-Agent': 'Mozilla/5.0 (compatible; PadreInspector/1.0)',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }
      : {
          Origin: 'https://pump.fun',
          'User-Agent': 'Mozilla/5.0 (compatible; PumpInspector/1.0)',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        }
  if (cookieHeader) {
    headers.Cookie = cookieHeader
  }

  const ws = new WebSocket(wsUrl, { headers, perMessageDeflate: true })

  ws.on('open', () => {
    console.log(`[${protocol}] WebSocket connected`)
    if (protocol === 'padre') {
      console.log('[padre] Sending auth handshake…')
      if (handshakeBase64) {
        const raw = Buffer.from(handshakeBase64, 'base64')
        ws.send(raw)
      } else {
        sendMsgpack(ws, [1, jwt, sessionId])
      }

      if (subscriptionEnvelope.length > 0) {
        console.log(`[padre] Queuing ${subscriptionEnvelope.length} subscription requests`)
        subscriptionEnvelope.forEach((payload, idx) => {
          setTimeout(() => {
            console.log(`[padre] → subscribe ${payload[2]}`)
            sendMsgpack(ws, payload)
          }, (idx + 1) * 200)
        })
      }
    } else {
      subscriptionEnvelope.forEach((payload, idx) => {
        setTimeout(() => {
          console.log(`[${protocol}] → ${payload.toString('utf8').trim()}`)
          ws.send(payload)
        }, idx * 100)
      })
    }

    timeout = setTimeout(() => {
      console.warn(`[${protocol}] Timeout waiting for messages`)
      ws.close()
      finalizeAndExit(1)
    }, TIMEOUT_MS)

    durationTimer = setTimeout(() => {
      console.log(`[${protocol}] Duration ${durationSeconds}s reached, closing connection`)
      ws.close()
      finalizeAndExit(0)
    }, durationSeconds * 1000)
  })

  ws.on('message', (data) => {
    const { entry, buffer } = analyseMessage(data)
    results.push(entry)
    logStream.write(JSON.stringify(entry) + '\n')

    if (entry.rawLength > 2 || buffer.length > 2) {
      interestingCount += 1
      console.log(
        `[${protocol}] Message #${results.length} captured (interesting, length=${entry.rawLength})`,
      )
    } else {
      console.log(`[${protocol}] Message #${results.length} captured (heartbeat, length=2)`)
    }

    if (interestingCount >= REQUIRED_INTERESTING || results.length >= MAX_MESSAGES) {
      ws.close()
      finalizeAndExit(0)
    }
  })

  ws.on('error', (err) => {
    console.error(`[${protocol}] WebSocket error:`, err.message)
    finalizeAndExit(1)
  })

  ws.on('close', (code, reason) => {
    console.log(`[padre] WebSocket closed (code=${code}, reason=${reason.toString()})`)
    if (results.length && timeout) {
      clearTimeout(timeout)
      finalizeAndExit(0)
    }
  })
}

main()

