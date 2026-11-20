-- Radar database foundation.
-- Provider payloads are intentionally not stored here.

create extension if not exists pgcrypto;

create table if not exists radar_tokens (
  coin_type text primary key,
  package_id text,
  module_name text,
  symbol text not null,
  name text,
  decimals integer,
  first_seen_at timestamptz,
  token_created_at timestamptz,
  latest_price_usd numeric(30, 12),
  latest_market_cap_usd numeric(30, 2),
  latest_liquidity_usd numeric(30, 2),
  latest_volume_24h_usd numeric(30, 2),
  market_observed_at timestamptz,
  metadata_source text,
  metadata_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists radar_markets (
  market_id text primary key,
  coin_type text not null references radar_tokens(coin_type) on delete cascade,
  base_coin_type text,
  quote_coin_type text,
  dex_id text,
  pair_address text,
  pool_created_at timestamptz,
  latest_price_usd numeric(30, 12),
  latest_liquidity_usd numeric(30, 2),
  latest_volume_24h_usd numeric(30, 2),
  observed_at timestamptz not null default now(),
  source text not null,
  unique (coin_type, pair_address)
);

create table if not exists radar_trades (
  trade_id bigserial primary key,
  coin_type text not null references radar_tokens(coin_type) on delete cascade,
  market_id text references radar_markets(market_id) on delete set null,
  wallet_address text not null,
  traded_at timestamptz not null,
  side text not null check (side in ('buy', 'sell', 'unknown')),
  token_amount numeric(40, 18),
  usd_amount numeric(30, 12),
  token_sold_address text,
  token_bought_address text,
  transaction_digest text,
  event_index integer,
  source text not null,
  source_trade_id text,
  observed_at timestamptz not null default now(),
  unique (source, source_trade_id),
  unique (source, transaction_digest, event_index)
);

create table if not exists radar_wallet_token_stats (
  coin_type text not null references radar_tokens(coin_type) on delete cascade,
  wallet_address text not null,
  first_trade_at timestamptz,
  last_trade_at timestamptz,
  buy_count integer not null default 0,
  sell_count integer not null default 0,
  bought_usd numeric(30, 12) not null default 0,
  sold_usd numeric(30, 12) not null default 0,
  realized_pnl_usd numeric(30, 12),
  roi_multiple numeric(30, 12),
  trade_count integer not null default 0,
  source text not null,
  coverage_start timestamptz,
  coverage_end timestamptz,
  is_complete boolean not null default false,
  calculated_at timestamptz not null default now(),
  primary key (coin_type, wallet_address, source)
);

create table if not exists radar_xray_scans (
  scan_id uuid primary key default gen_random_uuid(),
  coin_type text not null references radar_tokens(coin_type) on delete cascade,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  history_start timestamptz,
  history_end timestamptz,
  wallet_limit integer not null default 10,
  wallet_source text,
  status text not null check (status in ('pending', 'complete', 'partial', 'failed')),
  error_code text,
  error_message text
);

create table if not exists radar_xray_wallets (
  scan_id uuid not null references radar_xray_scans(scan_id) on delete cascade,
  wallet_address text not null,
  rank integer not null,
  roi_multiple numeric(30, 12),
  realized_pnl_usd numeric(30, 12),
  bought_usd numeric(30, 12),
  sold_usd numeric(30, 12),
  source text not null,
  is_complete boolean not null default false,
  primary key (scan_id, wallet_address)
);

create table if not exists radar_leaderboard_snapshots (
  snapshot_id bigserial primary key,
  period_start timestamptz not null,
  period_end timestamptz not null,
  wallet_address text not null,
  coin_type text references radar_tokens(coin_type) on delete set null,
  roi_multiple numeric(30, 12),
  realized_pnl_usd numeric(30, 12),
  source text not null,
  created_at timestamptz not null default now()
);

create table if not exists radar_provider_syncs (
  provider text not null,
  resource text not null,
  resource_key text not null,
  coverage_start timestamptz,
  coverage_end timestamptz,
  status text not null check (status in ('complete', 'partial', 'failed')),
  row_count integer not null default 0,
  last_error text,
  synced_at timestamptz not null default now(),
  primary key (provider, resource, resource_key)
);

create index if not exists radar_markets_coin_idx
  on radar_markets (coin_type, observed_at desc);
create index if not exists radar_trades_coin_time_idx
  on radar_trades (coin_type, traded_at desc);
create index if not exists radar_trades_wallet_coin_idx
  on radar_trades (wallet_address, coin_type, traded_at desc);
create index if not exists radar_wallet_stats_coin_roi_idx
  on radar_wallet_token_stats (coin_type, roi_multiple desc nulls last);
create index if not exists radar_xray_scans_coin_time_idx
  on radar_xray_scans (coin_type, requested_at desc);
create index if not exists radar_leaderboard_period_idx
  on radar_leaderboard_snapshots (period_end desc, roi_multiple desc nulls last);
