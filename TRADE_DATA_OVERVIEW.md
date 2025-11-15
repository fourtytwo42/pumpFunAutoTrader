# Trade Data Pipeline Overview (Temporary Notes)

This document explains, in detail, how the application ingests live trade data from Pump.fun, how that information is normalised and written to our database, and how the client later enriches that stream with on-demand metadata lookups.

---

## 1. High-Level Architecture

| Layer | Responsibilities | Key Code |
| ----- | ---------------- | -------- |
| **Server ingestion worker** (`src/scripts/ingest-trades.ts`) | Maintain a WebSocket connection to Pump.fun’s *unified trade feed*, decode each trade payload, normalise values (prices, volumes, timestamps, status flags), and persist the result in Postgres (`trades` + `trade_tape` + token snapshot tables). | `autotrader-ingest-trades` PM2 process |
| **Trade-retention worker** (`src/scripts/trade-retention.ts`) | Periodically delete any persisted trades older than one hour to stop the database from growing unbounded. | `autotrader-trade-retention` PM2 process |
| **Client UI** (`src/app/(dashboard)/dashboard/tokens/page.tsx`, token detail pages, etc.) | Fetches the *core* trade feed from our `/api/tokens` and `/api/trades` routes, then hydrates token metadata on-demand by calling the lightweight metadata proxy (`/api/tokens/[mint]/metadata`). | Browser + Next.js server components |

---

## 2. Server-Side WebSocket Ingestion

### 2.1 Connection Details
- **Endpoint**: `wss://unified-prod.nats.realtime.pump.fun/`
- **Protocol**: Pump.fun hosts their trade feed on NATS over WebSockets. We speak standard NATS control frames (`CONNECT`, `PING`, `SUB`, etc.) once the socket opens.
- **Subjects**: We subscribe to `unifiedTradeEvent.processed`, which streams every completed trade (bonding-curve and AMM) for all Pump.fun tokens.
- **Hardening**: `enforceConnectionLimit` injects query params (`connection_limit=1`, `pool_timeout=0`) into the `DATABASE_URL` to respect pump.fun connection quotas when multiple ingestion workers are spawned.

### 2.2 Message Handling
1. `connectToFeed()` opens the socket. When the `open` event fires we send:
   - `CONNECT <json>` payload (mirrors Pump.fun’s browser client headers/user agent).
   - An initial `PING`.
   - `SUB unifiedTradeEvent.processed <sid>` to start streaming.
2. Every incoming frame is appended to `messageBuffer`; the loop in `handleMessageChunk` drains the buffer one payload at a time.
   - PING/PONG frames are answered inline.
   - `MSG <subject> <sid> <reply-to?> <size>` frames are parsed; we slice out the quoted/binary payload.
   - Payloads are queued (`tradeQueue.push(...)`) and processed in batches to amortise Prisma writes.

### 2.3 Binary / Encoded Payload Characteristics
The “binary” descriptor refers to the fact that Pump.fun wraps trade JSON in a base64-like envelope before delivering it as text. `decodePumpUnifiedTradePayload` performs several heuristics:

1. **Outer quoting**: Many payloads arrive as `"\"{...}\""` (double-wrapped strings). The helper repeatedly `JSON.parse`s until the innermost string is revealed.
2. **Base64 detection**: If the working string is base64-looking (length%4==0, only base64 characters), we decode and continue processing the decoded UTF-8.
3. **Escapes**: Residual `\"` sequences are unescaped and re-parsed.
4. **Truncation fallback**: If parsing fails because of trailing noise, we attempt to parse up to the last `}`.

With those guards, almost every payload resolves into a `PumpUnifiedTrade` object with fields such as:

```ts
interface PumpUnifiedTrade {
  slotIndexId: string;
  tx: string;                // signature
  timestamp: string;         // ISO8601
  isBondingCurve: boolean;
  program: 'pump' | 'pump_amm' | string;
  mintAddress: string;
  quoteMintAddress: string;
  poolAddress: string;
  userAddress: string;
  type: 'buy' | 'sell';
  marketCap?: number | string;
  baseAmount?: number | string;
  quoteAmount?: number | string;
  amountSol?: number | string;
  amountUsd?: number | string;
  priceQuotePerBase?: number | string; // e.g. SOL per token
  priceBasePerQuote?: number | string;
  priceUsd?: number | string;
  priceSol?: number | string;
  protocolFee?: number | string;
  protocolFeeUsd?: number | string;
  lpFee?: number | string;
  lpFeeUsd?: number | string;
  creatorAddress?: string;
  coinMeta?: {
    name?: string;
    symbol?: string;
    uri?: string;
    mint?: string;
    bondingCurve?: string;
    creator?: string;
    createdTs?: number;
  };
  // plus any additional Pump.fun fields
}
```

### 2.4 Normalisation & Persistence
`processTradeBatch` pulls messages off the queue and transforms them via `prepareTradeContext`:

1. **Decimal Safety**: `Decimal.js` normalises base/quote sizes, SOL amounts, and prices to fixed precision.
2. **Implicit Fields**:
   - If Pump.fun omitted `priceSol`/`priceUsd`, we derive them from the amounts.
   - `amountUsd` defaults to `amountSol * priceUsd`.
   - `timestampMs` is parsed from `trade.timestamp`; fallback to `Date.now()` if the string is malformed.
3. **Status flags**:
   - `explicitlyBonding` is true if Pump.fun says the trade is still on the bonding curve.
   - `reachedKoth` is inferred from `isBondingCurve` and the `program` field (`pump_amm` = AMM = graduated).
   - King-of-the-Hill timestamps are promoted to `token.kingOfTheHillTimestamp`.
4. **Token Snapshot Management**:
   - We `upsert` the token row on every trade so the latest fallback name/symbol and last trade price are always recorded (even before metadata hydrates on the client).
   - If a token wrongly flips back to bonding (e.g. due to stale payload), we reset `completed` / `kingOfTheHillTimestamp`.
5. **Trade Records**:
   - `trade_tape`: stores the enriched trade JSON (`raw` column) for analytics and deduped by `txSig`.
   - `trades`: slimmer table keyed by `txSignature`, referencing `tokens.id`. Contains amounts in base units and SOL.

Only after successful writes do we log the human-readable summary:

```
📊 [SYMBOL] BUY | 0.123 SOL @ 0.000001234 SOL (0.01890 USD)
```

### 2.5 Retention Guardrails
The ingestion script re-uses `cleanupOldTrades(prisma)` (from `src/lib/trade-retention.ts`) on a five-minute interval. It deletes rows where:
```sql
trades.timestamp   < now() - 1 hour
trade_tape.ts      < now() - 1 hour
```

Additionally, the dedicated `retention:trades` worker keeps running even if ingestion temporarily stops, ensuring historical data never exceeds the one-hour SLA.

---

## 3. Client Metadata Hydration

### 3.1 Why Metadata Moved Client-Side
We removed all long-lived metadata columns (`imageUri`, `twitter`, `telegram`, `website`) from server writes because they were:
- Incomplete/stale (Pump.fun updates metadata out-of-band),
- Responsible for disk bloat (storing large JSON blobs in Postgres),
- Difficult to cache coherently between ingestion and UI layers.

Now the server only keeps *fallback* name/symbol values (derived from the trade itself) so the UI always has something to display, even before metadata resolves.

### 3.2 Metadata Fetch Flow
1. **Client Request**: When a token card (or token detail page) needs metadata, `hydrateTokenMetadata` first checks an in-memory `Map`. If empty, it hits `/api/tokens/<mint>/metadata`.
2. **Proxy Endpoint** (`src/app/api/tokens/[mintAddress]/metadata/route.ts`):
   - Decodes the path parameter (to handle `%`-encoding).
   - Calls `getTokenDetails` in `src/lib/pump-api.ts`.
   - Returns `{ name, symbol, imageUri, twitter, telegram, website }`.
   - Error cases return 404 (unknown mint) or 502 (Pump API error).
3. **Pump.fun REST Calls** (`getTokenDetails`):
   - Primary fetch: `https://frontend-api-v3.pump.fun/coins/{mint}`.
   - If the response references `metadata_uri`, we fetch that JSON (via Pinata gateway for IPFS URIs) to get richer fields (description, image, socials).
   - `normaliseMetadataUri` converts `ipfs://` to Pump.fun’s Pinata CDN.

### 3.3 Result Usage
- The React component merges metadata with the trade feed entry and updates the UI.
- Twitter/Telegram/Website icons are only rendered if URLs exist; otherwise we show placeholders to keep the layout stable.
- Because metadata fetches happen in the browser, the information is always current without requiring a database migration when Pump.fun updates imagery or project links.

---

## 4. Data We Expose to the Rest of the App

Once persisted, the data powers multiple surfaces:

| Consumer | Source | Notes |
| -------- | ------ | ----- |
| `/api/tokens` | Postgres via Prisma | Server-side filtering (timeframe, graduation state, KOTH state, market cap, unique traders) before the UI paginates. |
| `/api/trades` | `trades` table | Recent trades for detail pages and dashboards. |
| Token cards (`dashboard/tokens/page.tsx`) | Combination of `/api/tokens` output + metadata hydration + SOL price from wallet provider | Calculates bonding-curve graduation progress, unique trader counts, volumes, etc. |
| AI traders / portfolios | `user_trades`, `user_portfolios`, and derived prices | Each simulation uses `advanceSimulationSession` to keep virtual timestamps consistent. |

Because the ingestion worker stores the raw Pump payload (JSON) in `trade_tape.raw`, advanced analytics can still reconstruct any field that we do not explicitly normalise today.

---

## 5. Testing & Operational Reminders

- The ingestion worker (`autotrader-ingest-trades`) and retention worker (`autotrader-trade-retention`) are managed via `pm2 start ecosystem.config.js`.
- `npm run build` will fail until port 3000 is freed or conditioned to dynamic behaviour; this is expected due to dynamic server routes that inspect `headers`/`searchParams`.
- To inspect raw payloads during debugging, temporarily lift the `decodeFailureSamples` cap in `decodePumpUnifiedTradePayload` – the console logs include the first 200 chars of any unparsable payload.

---

### TL;DR
- **Ingestion**: We consume Pump.fun’s NATS WebSocket stream, aggressively clean and parse the quasi-binary payloads, and upsert canonical trade records every few milliseconds.
- **Retention**: Two independent jobs ensure anything older than one hour is deleted, protecting disk utilisation.
- **Metadata**: The browser fetches metadata on demand through a tiny Next.js proxy that mirrors Pump.fun’s REST API, keeping the UI fresh without extra storage.

These three pieces form the backbone of our live trading experience.

