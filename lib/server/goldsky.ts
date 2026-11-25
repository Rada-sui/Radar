import "server-only";
import type { PnlTrade } from "./pnl";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENABLED = process.env.GOLDSKY_TRADES_ENABLED === "true";
const HISTORY_DAYS = 30;

type StoredTrade = {
  coin_type?: unknown;
  wallet_address?: unknown;
  traded_at?: unknown;
  side?: unknown;
  token_amount?: unknown;
  usd_amount?: unknown;
  transaction_digest?: unknown;
};

function number(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Reads the 30-day Goldsky stream after Goldsky has delivered normalized rows
 * into Supabase. The provider is deliberately not queried from the browser.
 */
export async function goldskyTrades(now = Date.now()): Promise<PnlTrade[] | null> {
  if (!ENABLED || !SUPABASE_URL || !SUPABASE_KEY) return null;
  const since = new Date(now - HISTORY_DAYS * 24 * 60 * 60_000).toISOString();
  const query = new URLSearchParams({
    source: "eq.goldsky",
    traded_at: `gte.${since}`,
    order: "traded_at.asc",
    limit: "50000",
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/radar_trades?${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const rows = await response.json() as unknown;
  if (!Array.isArray(rows)) return null;
  const out: PnlTrade[] = [];
  for (const row of rows as StoredTrade[]) {
    const coin = typeof row.coin_type === "string" ? row.coin_type : "";
    const wallet = typeof row.wallet_address === "string" ? row.wallet_address : "";
    const side = row.side === "buy" || row.side === "sell" ? row.side : null;
    const ts = typeof row.traded_at === "string" ? Date.parse(row.traded_at) : NaN;
    const tokens = number(row.token_amount);
    const usd = number(row.usd_amount);
    if (!coin || !wallet || !side || !Number.isFinite(ts) || tokens === null || tokens <= 0 || usd === null || usd < 0) continue;
    out.push({
      token: coin,
      wallet,
      side,
      ts,
      block: null,
      tx: typeof row.transaction_digest === "string" ? row.transaction_digest : "",
      tokens,
      usd,
    });
  }
  return out.length > 0 ? out : null;
}

export const goldskyHistoryDays = HISTORY_DAYS;
