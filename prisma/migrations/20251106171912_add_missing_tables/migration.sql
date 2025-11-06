-- CreateTable
CREATE TABLE "token_stats" (
    "mint" TEXT NOT NULL,
    "px" DECIMAL(30,18),
    "price_change_30s_pct" DECIMAL(18,6),
    "volume_sol_30s" DECIMAL(20,9),
    "volume_sol_1m" DECIMAL(20,9),
    "volume_sol_5m" DECIMAL(20,9),
    "buys_per_sec" DECIMAL(18,6),
    "sells_per_sec" DECIMAL(18,6),
    "buy_sell_imbalance" DECIMAL(18,6),
    "unique_traders_30s" INTEGER,
    "unique_traders_1m" INTEGER,
    "m1_vs_5m_velocity" DECIMAL(18,6),
    "vSol" DECIMAL(30,18),
    "vTok" DECIMAL(30,18),
    "est_fill_bps_005" DECIMAL(18,6),
    "est_fill_bps_010" DECIMAL(18,6),
    "est_fill_bps_015" DECIMAL(18,6),
    "dd_from_ath_pct" DECIMAL(18,6),
    "ema_20" DECIMAL(30,18),
    "ema_50" DECIMAL(30,18),
    "atr_14" DECIMAL(30,18),
    "vwap_1h" DECIMAL(30,18),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_stats_pkey" PRIMARY KEY ("mint")
);

-- CreateTable
CREATE TABLE "agent_watchlist" (
    "mint" TEXT NOT NULL,
    "token_id" TEXT,
    "max_entry_sol" DECIMAL(20,9),
    "min_users_1m" INTEGER,
    "max_impact_bps_010" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_watchlist_pkey" PRIMARY KEY ("mint")
);

-- CreateTable
CREATE TABLE "agent_rules" (
    "id" TEXT NOT NULL,
    "mint" TEXT,
    "expression_json" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cooldown_sec" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_signals" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mint" TEXT,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_kv" (
    "k" TEXT NOT NULL,
    "v" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cache_kv_pkey" PRIMARY KEY ("k")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "label" TEXT,
    "pubkey" TEXT NOT NULL,
    "signerBlob" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "qty" DECIMAL(30,18) NOT NULL,
    "avg_cost_usd" DECIMAL(30,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "qty_tokens" DECIMAL(30,18),
    "qty_sol" DECIMAL(30,18),
    "limit_price_usd" DECIMAL(30,18),
    "slippage_bps" INTEGER,
    "reason" TEXT,
    "tx_sig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fill_qty" DECIMAL(30,18) NOT NULL,
    "cost_sol" DECIMAL(30,18) NOT NULL,
    "fee_sol" DECIMAL(30,18) NOT NULL,
    "price_usd" DECIMAL(30,18),
    "tx_sig" TEXT,

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_tape" (
    "id" TEXT NOT NULL,
    "walletId" TEXT,
    "tokenMint" TEXT NOT NULL,
    "tx_sig" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_buy" BOOLEAN NOT NULL,
    "base_amount" DECIMAL(30,18) NOT NULL,
    "quote_sol" DECIMAL(30,18) NOT NULL,
    "price_usd" DECIMAL(30,18),
    "price_sol" DECIMAL(30,18),
    "user_address" TEXT,
    "slot" BIGINT,
    "raw" JSONB,

    CONSTRAINT "trade_tape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pnl_ledger" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "tokenMint" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "amount_usd" DECIMAL(30,18) NOT NULL,
    "meta" JSONB,

    CONSTRAINT "pnl_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holder_snapshots" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "top_json" JSONB NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "holder_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_activity_snapshots" (
    "id" TEXT NOT NULL,
    "tokenMint" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "market_activity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_events" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "walletId" TEXT,
    "tokenMint" TEXT,
    "traceId" TEXT,
    "rationale" TEXT,
    "input" JSONB,
    "output" JSONB,
    "metrics" JSONB,
    "tool_name" TEXT,

    CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_rules_mint_idx" ON "agent_rules"("mint");

-- CreateIndex
CREATE INDEX "agent_signals_mint_created_at_idx" ON "agent_signals"("mint", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_pubkey_key" ON "wallets"("pubkey");

-- CreateIndex
CREATE UNIQUE INDEX "positions_walletId_tokenMint_key" ON "positions"("walletId", "tokenMint");

-- CreateIndex
CREATE INDEX "orders_walletId_status_idx" ON "orders"("walletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trade_tape_tx_sig_key" ON "trade_tape"("tx_sig");

-- CreateIndex
CREATE INDEX "trade_tape_tokenMint_ts_idx" ON "trade_tape"("tokenMint", "ts");

-- CreateIndex
CREATE INDEX "holder_snapshots_tokenMint_ts_idx" ON "holder_snapshots"("tokenMint", "ts");

-- CreateIndex
CREATE INDEX "market_activity_snapshots_tokenMint_window_ts_idx" ON "market_activity_snapshots"("tokenMint", "window", "ts");

-- CreateIndex
CREATE INDEX "agent_events_ts_idx" ON "agent_events"("ts");

-- CreateIndex
CREATE INDEX "chat_messages_ts_idx" ON "chat_messages"("ts");

-- AddForeignKey
ALTER TABLE "token_stats" ADD CONSTRAINT "token_stats_mint_fkey" FOREIGN KEY ("mint") REFERENCES "tokens"("mint_address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_watchlist" ADD CONSTRAINT "agent_watchlist_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "tokens"("mint_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "tokens"("mint_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tape" ADD CONSTRAINT "trade_tape_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_tape" ADD CONSTRAINT "trade_tape_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "tokens"("mint_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pnl_ledger" ADD CONSTRAINT "pnl_ledger_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holder_snapshots" ADD CONSTRAINT "holder_snapshots_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "tokens"("mint_address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_activity_snapshots" ADD CONSTRAINT "market_activity_snapshots_tokenMint_fkey" FOREIGN KEY ("tokenMint") REFERENCES "tokens"("mint_address") ON DELETE RESTRICT ON UPDATE CASCADE;

