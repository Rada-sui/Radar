import "server-only";

import type { LeaderBoard, RadarToken, ReportData, XRayResult } from "@/lib/types";
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

async function insert(table: string, rows: Record<string, unknown>[], returning = false): Promise<Record<string, unknown>[]> {
  if (!configured() || rows.length === 0) return [];
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: returning ? "return=representation" : "return=minimal",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase ${table} insert failed (${response.status})`);
  if (!returning) return [];
  const body = await response.json() as unknown;
  return Array.isArray(body) ? body.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object")) : [];
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

/** Persist the completed X-Ray result and its ranked wallet rows. */
export async function persistXrayResult(result: XRayResult, source: string) {
  if (!configured()) return;
  try {
    const now = new Date().toISOString();
    const token = result.token;
    const [packageId, moduleName] = token.address.split("::");
    await upsert("radar_tokens", [{
      coin_type: token.address,
      package_id: packageId ?? null,
      module_name: moduleName ?? null,
      symbol: token.symbol,
      name: token.name,
      first_seen_at: now,
      token_created_at: isoFromAge(token.ageMinutes),
      latest_price_usd: token.priceUsd,
      latest_market_cap_usd: token.marketCap,
      latest_liquidity_usd: token.liquidityUsd,
      latest_volume_24h_usd: token.volumeH24,
      market_observed_at: now,
      metadata_source: source,
      metadata_observed_at: now,
    }], "coin_type");
    if (token.pairAddress) {
      await upsert("radar_markets", [{
        market_id: `${source}:${token.pairAddress}`,
        coin_type: token.address,
        dex_id: token.dex,
        pair_address: token.pairAddress,
        latest_price_usd: token.priceUsd,
        latest_liquidity_usd: token.liquidityUsd,
        latest_volume_24h_usd: token.volumeH24,
        observed_at: now,
        source,
      }], "market_id");
    }
    if (result.wallets.length > 0) {
      await upsert("radar_wallet_token_stats", result.wallets.map((wallet) => ({
        coin_type: token.address,
        wallet_address: wallet.address,
        first_trade_at: wallet.firstBuyAt ? new Date(wallet.firstBuyAt).toISOString() : null,
        last_trade_at: wallet.lastSellAt ? new Date(wallet.lastSellAt).toISOString() : null,
        buy_count: wallet.buys,
        sell_count: wallet.sells,
        bought_usd: wallet.boughtUsd,
        sold_usd: wallet.soldUsd,
        realized_pnl_usd: wallet.realisedUsd,
        roi_multiple: wallet.roiMultiple,
        trade_count: wallet.buys + wallet.sells,
        source,
        coverage_start: result.coverage.windowStart ? new Date(result.coverage.windowStart).toISOString() : null,
        coverage_end: result.coverage.windowEnd ? new Date(result.coverage.windowEnd).toISOString() : null,
        is_complete: result.coverage.kind === "complete" && !wallet.partial,
        calculated_at: now,
      })), "coin_type,wallet_address,source");
    }
    const scanRows = await insert("radar_xray_scans", [{
      coin_type: token.address,
      completed_at: now,
      history_start: result.coverage.windowStart ? new Date(result.coverage.windowStart).toISOString() : null,
      history_end: result.coverage.windowEnd ? new Date(result.coverage.windowEnd).toISOString() : null,
      wallet_limit: result.wallets.length,
      wallet_source: source,
      status: result.coverage.kind === "complete" ? "complete" : result.coverage.kind === "partial" ? "partial" : "failed",
      error_code: null,
      error_message: result.coverage.note || null,
    }], true);
    const scanId = scanRows[0]?.scan_id;
    if (typeof scanId === "string" && result.wallets.length > 0) {
      await insert("radar_xray_wallets", result.wallets.map((wallet, index) => ({
        scan_id: scanId,
        wallet_address: wallet.address,
        rank: index + 1,
        roi_multiple: wallet.roiMultiple,
        realized_pnl_usd: wallet.realisedUsd,
        bought_usd: wallet.boughtUsd,
        sold_usd: wallet.soldUsd,
        source,
        is_complete: !wallet.partial,
      })));
    }
    await sync(source, "xray", token.address, result.wallets.length, result.coverage.kind === "complete" ? "complete" : "partial");
  } catch (error) {
    await sync(source, "xray", result.token.address, result.wallets.length, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}

/** Persist one leaderboard build as an immutable period snapshot. */
export async function persistLeaderboard(board: LeaderBoard, source = "radar") {
  if (!configured() || board.rows.length === 0) return;
  try {
    const end = new Date(board.updatedAt);
    const start = new Date(board.updatedAt - board.scan.windowHours * 3_600_000);
    await insert("radar_leaderboard_snapshots", board.rows.map((row, index) => ({
      period_start: start.toISOString(),
      period_end: end.toISOString(),
      wallet_address: row.address,
      roi_multiple: row.soldUsd - row.realisedUsd > 0 ? row.soldUsd / (row.soldUsd - row.realisedUsd) : null,
      realized_pnl_usd: row.realisedUsd,
      recent_realized_pnl_usd: row.recentRealisedUsd,
      rank: index + 1,
      score: row.score,
      tier: row.tier,
      period_hours: board.scan.windowHours,
      recent_hours: board.scan.recentHours,
      partial: row.partial,
      source,
    })));
    await sync(source, "leaderboard", end.toISOString(), board.rows.length, "complete");
  } catch (error) {
    await sync(source, "leaderboard", new Date(board.updatedAt).toISOString(), board.rows.length, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}

/** Persist the report as a replaceable daily snapshot, keeping the latest build for that date. */
export async function persistReport(report: ReportData, source = "radar") {
  if (!configured()) return;
  try {
    const generatedAt = new Date(report.updatedAt);
    const date = generatedAt.toISOString().slice(0, 10);
    await upsert("radar_report_snapshots", [{
      report_key: `${source}:${date}`,
      report_date: date,
      report,
      source,
      generated_at: generatedAt.toISOString(),
    }], "report_key");
    await sync(source, "report", date, report.newest.length + report.runners.length, "complete");
  } catch (error) {
    await sync(source, "report", new Date(report.updatedAt).toISOString().slice(0, 10), 0, "failed", error instanceof Error ? error.message : String(error)).catch(() => undefined);
  }
}
