-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'power_user', 'user');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_ai_agent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens" (
    "id" TEXT NOT NULL,
    "mint_address" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image_uri" TEXT,
    "twitter" TEXT,
    "telegram" TEXT,
    "website" TEXT,
    "created_timestamp" BIGINT NOT NULL,
    "king_of_the_hill_timestamp" BIGINT,
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "creator_address" TEXT NOT NULL,
    "total_supply" DECIMAL(30,9) NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_prices" (
    "tokenId" TEXT NOT NULL,
    "price_sol" DECIMAL(30,18) NOT NULL,
    "price_usd" DECIMAL(20,2) NOT NULL,
    "last_trade_timestamp" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_prices_pkey" PRIMARY KEY ("tokenId")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" BIGSERIAL NOT NULL,
    "token_id" TEXT NOT NULL,
    "tx_signature" TEXT NOT NULL,
    "user_address" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "amount_sol" DECIMAL(20,9) NOT NULL,
    "amount_usd" DECIMAL(20,2) NOT NULL,
    "base_amount" DECIMAL(30,9) NOT NULL,
    "price_sol" DECIMAL(30,18) NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candles" (
    "id" BIGSERIAL NOT NULL,
    "token_id" TEXT NOT NULL,
    "interval" INTEGER NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "open" DECIMAL(30,18) NOT NULL,
    "high" DECIMAL(30,18) NOT NULL,
    "low" DECIMAL(30,18) NOT NULL,
    "close" DECIMAL(30,18) NOT NULL,
    "volume" DECIMAL(30,9) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_portfolios" (
    "user_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "amount" DECIMAL(30,9) NOT NULL,
    "avg_buy_price" DECIMAL(30,18) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_portfolios_pkey" PRIMARY KEY ("user_id","token_id")
);

-- CreateTable
CREATE TABLE "user_trades" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "amount_sol" DECIMAL(20,9) NOT NULL,
    "amount_tokens" DECIMAL(30,9) NOT NULL,
    "price_sol" DECIMAL(30,18) NOT NULL,
    "simulated_timestamp" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "user_id" TEXT NOT NULL,
    "start_timestamp" BIGINT NOT NULL,
    "current_timestamp" BIGINT NOT NULL,
    "playback_speed" DECIMAL(4,2) NOT NULL,
    "sol_balance_start" DECIMAL(20,9) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "ai_trader_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "log_type" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "timestamp" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_trader_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_trader_configs" (
    "user_id" TEXT NOT NULL,
    "config_name" TEXT NOT NULL,
    "strategy_type" TEXT NOT NULL,
    "config_json" JSONB NOT NULL,
    "is_running" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "last_activity_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_trader_configs_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sol_prices" (
    "id" BIGSERIAL NOT NULL,
    "price_usd" DECIMAL(10,2) NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sol_prices_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_api_key_hash_key" ON "user_api_keys"("api_key_hash");

-- CreateIndex
CREATE INDEX "user_api_keys_api_key_hash_idx" ON "user_api_keys"("api_key_hash");

-- CreateIndex
CREATE INDEX "user_api_keys_user_id_idx" ON "user_api_keys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_mint_address_key" ON "tokens"("mint_address");

-- CreateIndex
CREATE INDEX "tokens_mint_address_idx" ON "tokens"("mint_address");

-- CreateIndex
CREATE INDEX "tokens_symbol_idx" ON "tokens"("symbol");

-- CreateIndex
CREATE INDEX "tokens_created_timestamp_idx" ON "tokens"("created_timestamp");

-- CreateIndex
CREATE INDEX "token_prices_updated_at_idx" ON "token_prices"("updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "trades_tx_signature_key" ON "trades"("tx_signature");

-- CreateIndex
CREATE INDEX "trades_token_id_timestamp_idx" ON "trades"("token_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "trades_timestamp_idx" ON "trades"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "trades_user_address_timestamp_idx" ON "trades"("user_address", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "candles_token_id_interval_timestamp_idx" ON "candles"("token_id", "interval", "timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "candles_token_id_interval_timestamp_key" ON "candles"("token_id", "interval", "timestamp");

-- CreateIndex
CREATE INDEX "user_portfolios_user_id_idx" ON "user_portfolios"("user_id");

-- CreateIndex
CREATE INDEX "user_trades_user_id_simulated_timestamp_idx" ON "user_trades"("user_id", "simulated_timestamp" DESC);

-- CreateIndex
CREATE INDEX "user_trades_token_id_simulated_timestamp_idx" ON "user_trades"("token_id", "simulated_timestamp" DESC);

-- CreateIndex
CREATE INDEX "user_sessions_is_active_current_timestamp_idx" ON "user_sessions"("is_active", "current_timestamp");

-- CreateIndex
CREATE INDEX "ai_trader_logs_user_id_timestamp_idx" ON "ai_trader_logs"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_trader_logs_log_type_timestamp_idx" ON "ai_trader_logs"("log_type", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "ai_trader_configs_is_running_last_activity_at_idx" ON "ai_trader_configs"("is_running", "last_activity_at");

-- CreateIndex
CREATE INDEX "sol_prices_timestamp_idx" ON "sol_prices"("timestamp" DESC);

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
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_prices" ADD CONSTRAINT "token_prices_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_portfolios" ADD CONSTRAINT "user_portfolios_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_portfolios" ADD CONSTRAINT "user_portfolios_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trades" ADD CONSTRAINT "user_trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_trades" ADD CONSTRAINT "user_trades_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trader_logs" ADD CONSTRAINT "ai_trader_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trader_configs" ADD CONSTRAINT "ai_trader_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_trader_configs" ADD CONSTRAINT "ai_trader_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

