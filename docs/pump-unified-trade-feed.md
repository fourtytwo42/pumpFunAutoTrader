## Pump.fun Unified Trade Feed Migration

The legacy Socket.IO `tradeCreated` stream served from `frontend-api-v3.pump.fun` is no longer reliable. Pump.fun now publishes real-time trades via a NATS websocket (`wss://unified-prod.nats.realtime.pump.fun/`) and exposes token metadata through the Pinata gateway. This document captures the key details for connecting to the new feed and retrieving metadata so we can keep the ingester, backend and UI in sync.

---

### 1. Connection Overview

| Item | Value |
| --- | --- |
| WebSocket URL | `wss://unified-prod.nats.realtime.pump.fun/` |
| Protocol | NATS over websocket |
| Origin | `https://pump.fun` |
| Auth | Anonymous subscriber credentials provided by Pump (`user=subscriber`, `pass=OX745xvUbNQMuFqV`) |
| Subjects of interest | `unifiedTradeEvent.processed` |

On connect:

1. Send a `CONNECT` frame with the JSON payload below.
2. Optionally send a `PING` immediately.
3. Subscribe to the unified trade subject.
4. Respond with `PONG` to any `PING` frames from the server.

```text
CONNECT {"no_responders":true,"protocol":1,"verbose":false,"pedantic":false,"user":"subscriber","pass":"OX745xvUbNQMuFqV","lang":"nats.ws","version":"1.30.3","headers":true}
PING
SUB unifiedTradeEvent.processed sub0
```

Server frames use the standard NATS format:

```
MSG <subject> <sid> <size>\r\n<payload>\r\n
```

The payload itself is a JSON string literal (quoted JSON). Unwrap it once with `JSON.parse(...)` to get the nested JSON text and parse it again to obtain the trade object.

---

### 2. Unified Trade Payload

After decoding the quoted string you receive an object like:

```json
{
  "slotIndexId": "0003785923440008480000",
  "tx": "126cezFuhoWg7...",
  "timestamp": "2025-11-07T21:15:50.000Z",
  "isBondingCurve": true,
  "program": "pump",
  "mintAddress": "HGcq6...",
  "quoteMintAddress": "So1111...",
  "poolAddress": "3FgA9...",
  "userAddress": "5sC3A...",
  "type": "buy",
  "marketCap": "5088.736410277334069112860116449060395734",
  "baseAmount": "9813351.324671",
  "quoteAmount": "0.302968318",
  "amountSol": "0.302968318",
  "amountUsd": "49.45993302139377586963048",
  "priceQuotePerBase": "3.1171209032980533e-8",
  "priceUsd": "0.000005088736410277334069112860116449060395734",
  "priceSol": "3.1171209032980533e-8",
  "protocolFee": "0.0028782",
  "protocolFeeUsd": "0.469869523526138352552",
  "creatorAddress": "FeWg1yHM62...",
  "creatorFee": "0.000908905",
  "creatorFeeUsd": "0.1483798065737352440158",
  "coinMeta": {
    "name": "#DigitalResistance",
    "symbol": "RESISTANCE",
    "uri": "ipfs://...",
    "mint": "HGcq6...",
    "bondingCurve": "GJuWKe4gN144...",
    "creator": "FeWg1yHM62...",
    "createdTs": 1762550142365
  }
}
```

Key callouts:

- `type`: `"buy"` or `"sell"`.
- `baseAmount`: token quantity in whole tokens (not base units).
- `amountSol`: SOL volume in SOL, already decimalised.
- `priceSol` / `priceUsd`: per-token price.
- `coinMeta.uri`: IPFS metadata link for rich details (image, socials, description).

---

### 3. Token Metadata

Use the metadata URI from `coinMeta` to hydrate token details. Normalise `ipfs://` URIs via Pinata’s gateway:

```
ipfs://Qm...  →  https://pump.mypinata.cloud/ipfs/Qm...
```

Example response (`API examples/metadata.txt`):

```json
{
  "name": "BaoBaoSol",
  "symbol": "baos",
  "description": "...",
  "image": "https://cf-ipfs.com/ipfs/QmbtHmmdYTpFsTAUH8h8mhErdikgyPhES6hNwwaNUtkpe9",
  "twitter": "@baobaosol",
  "telegram": "@baobaosol",
  "website": "..."
}
```

Cache metadata responses to avoid hammering the gateway; they are static once a token is created.

---

### 4. Normalisation Rules Used by AutoTrader

The ingestion service applies the following transformations:

- **SOL / USD conversions**: Uses cached SOL/USD price from the `sol_prices` table (fallback 160 if missing).
- **Token supply**: Defaults to 1 000 000 000 tokens (1e9) × 1e6 base units (`1_000_000_000 * 1_000_000`).
- **Amounts**: `baseAmount` is stored in base units (tokens × 1e6) to match existing schema.
- **TradeTape**: A lightweight record (token, side, amounts, prices, raw JSON) is persisted for UI queries.
- **Metadata**: Image / socials fetched once from the Pinata URL and saved on the `tokens` row.

See `src/scripts/ingest-trades.ts` for the complete implementation.

---

### 5. Live Updates for the Frontend

- The backend websocket (`/api/stream`) now proxies the unified feed via a singleton connection in `src/server/pumpRealtime.ts`.
- Each trade triggers an application event (`trade:new`) ensuring the dashboard refresh behaves the same way it did with the old Socket.IO feed.
- Consumers that still rely on the old `tradeCreated` shape should migrate to the normalised payload emitted by the new relay (mint, tx, type, timestamp, program). Additional details can be fetched on demand from `/api/trades` or the metadata endpoint described above.

---

### 6. Quick Reference Snippet

```ts
import WebSocket from 'ws'

const ws = new WebSocket('wss://unified-prod.nats.realtime.pump.fun/', {
  headers: {
    Origin: 'https://pump.fun',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
})

ws.on('open', () => {
  ws.send('CONNECT {"protocol":1,"user":"subscriber","pass":"OX745xvUbNQMuFqV","headers":true}\r\n')
  ws.send('PING\r\n')
  ws.send('SUB unifiedTradeEvent.processed client0\r\n')
})

ws.on('message', (data) => {
  const text = data.toString()
  if (text.startsWith('MSG')) {
    const payload = text.split('\r\n')[1]
    const trade = JSON.parse(JSON.parse(payload))
    console.log(trade.mintAddress, trade.type, trade.amountSol)
  } else if (text.startsWith('PING')) {
    ws.send('PONG\r\n')
  }
})
```

---

### 7. Related Assets

- Example captured frames: `API examples/binaryTradeWS.txt`
- Sample metadata response: `API examples/metadata.txt`
- Ingestion implementation: `src/scripts/ingest-trades.ts`
- Websocket relay for the UI: `src/server/pumpRealtime.ts`

