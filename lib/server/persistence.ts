import "server-only";

import type { RadarToken } from "@/lib/types";
import type { Trade } from "./analysis";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type PersistMarket = {
  pairAddress: string;
  dexId?: string | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  volumeH24?: number | null;
  createdAt?: number | null;
  source: string;
};

function configured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function isoFromAge(ageMinutes: number | null) {
  if (ageMinutes === null || !Number.isFinite(ageMinutes)) return null;
  return new Date(Date.now() - Math.max(0, ageMinutes) * 60_000).toISOString();
}

async function upsert(table: string, rows: Record<string, unknown>[], conflict: string, resolution: "merge-duplicates" | "ignore-duplicates" = "merge-duplicates") {
  if (!configured() || rows.length === 0) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: `resolution=${resolution},return=minimal`,
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Supabase ${table} upsert failed (${response.status})`);
  }
}

async function sync(provider: string, resource: string, resourceKey: string, rowCount: number, status: "complete" | "partial" | "failed", error?: string) {
  await upsert("radar_provider_syncs", [{
    provider,
    resource,
    resource_key: resourceKey,
    status,
    row_count: rowCount,
    last_error: error ?? null,
    synced_at: new Date().toISOString(),
  }], "provider,resource,resource_key");
}

/** Persist the normalized token and market snapshot without affecting the response path. */
export async function persistRadarTokens(tokens: RadarToken[], source: string) {
  if (!configured() || tokens.length === 0) return;
  try {
    const tokenRows = tokens.map((token) => {
      const [packageId, moduleName] = token.address.split("::");
      return {
        coin_type: token.address,
        package_id: packageId ?? null,
        module_name: moduleName ?? null,
        symbol: token.symbol,
        name: token.name,
        first_seen_at: new Date().toISOString(),
        token_created_at: isoFromAge(token.ageMinutes),
        latest_price_usd: token.priceUsd,
        latest_market_cap_usd: token.marketCap,
        latest_liquidity_usd: token.liquidityUsd,
        latest_volume_24h_usd: token.volumeH24,
        market_observed_at: new Date().toISOString(),
        metadata_source: source,
        metadata_observed_at: new Date().toISOString(),
      };
    });
    await upsert("radar_tokens", tokenRows, "coin_type");

    const markets = tokens
      .filter((token) => token.pairAddress)
      .map((token) => ({
        market_id: `${source}:${token.pairAddress}`,
        coin_type: token.address,
        dex_id: token.dex,
        pair_address: token.pairAddress,
        latest_price_usd: token.priceUsd,
        latest_liquidity_usd: token.liquidityUsd,
        latest_volume_24h_usd: token.volumeH24,
        observed_at: new Date().toISOString(),
        source,
      }));
    await upsert("radar_markets", markets, "market_id");
    await sync(source, "tokens", "feed", tokens.length, "complete");
  } catch (error) {
    await sync(source, "tokens", "feed", tokens.length, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}

/** Persist DexScreener pair snapshots when X-Ray or a token lookup uses them. */
export async function persistDexPairs(coinType: string, pairs: PersistMarket[]) {
  if (!configured() || pairs.length === 0) return;
  try {
    const token = pairs[0];
    await upsert("radar_tokens", [{
      coin_type: coinType,
      symbol: "?",
      name: "Unknown",
      latest_price_usd: token.priceUsd ?? null,
      latest_liquidity_usd: token.liquidityUsd ?? null,
      latest_volume_24h_usd: token.volumeH24 ?? null,
      market_observed_at: new Date().toISOString(),
      metadata_source: "dexscreener",
      metadata_observed_at: new Date().toISOString(),
    }], "coin_type", "ignore-duplicates");
    await upsert("radar_markets", pairs.map((pair) => ({
      market_id: `dexscreener:${pair.pairAddress}`,
      coin_type: coinType,
      dex_id: pair.dexId ?? null,
      pair_address: pair.pairAddress,
      latest_price_usd: pair.priceUsd ?? null,
      latest_liquidity_usd: pair.liquidityUsd ?? null,
      latest_volume_24h_usd: pair.volumeH24 ?? null,
      pool_created_at: pair.createdAt ? new Date(pair.createdAt).toISOString() : null,
      observed_at: new Date().toISOString(),
      source: pair.source,
    })), "market_id");
    await sync("dexscreener", "pairs", coinType, pairs.length, "complete");
  } catch (error) {
    await sync("dexscreener", "pairs", coinType, pairs.length, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}

export async function persistTrades(coinType: string, trades: Trade[], source: string) {
  if (!configured() || trades.length === 0) return;
  try {
    await upsert("radar_trades", trades.map((trade) => ({
      coin_type: coinType,
      wallet_address: trade.wallet,
      traded_at: new Date(trade.ts).toISOString(),
      side: trade.side,
      token_amount: trade.tokens,
      usd_amount: trade.usd,
      transaction_digest: trade.tx || null,
      source,
      source_trade_id: `${trade.tx || "no-tx"}:${trade.ts}:${trade.wallet}`,
      observed_at: new Date().toISOString(),
    })), "source,source_trade_id");
    await sync(source, "trades", coinType, trades.length, "complete");
  } catch (error) {
    await sync(source, "trades", coinType, trades.length, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}
