import "server-only";

import type { Trade } from "./analysis";
import { fetchJson } from "./cache";
import { num } from "./parse";
import { persistTrades } from "./persistence";

const BASE = process.env.BLOCKVISION_BASE ?? "https://api.blockvision.org/v2";
const KEY = process.env.BLOCKVISION_API_KEY?.trim() ?? "";
const PER_MINUTE = 20;

type CoinChange = { coinType?: string; balance?: string; amount?: string; decimals?: number };
type CoinTrade = {
  type?: string;
  txDigest?: string;
  timestamp?: number;
  sender?: string;
  usdValue?: string;
  coinChanges?: CoinChange[];
};
type Response = { data?: CoinTrade[]; nextPageCursor?: string | null };

export const blockVisionEnabled = () => KEY.length > 0;

/**
 * BlockVision is supplementary activity data. Tide remains X-Ray's primary
 * all-time source; this adapter is intentionally capped and marked partial.
 */
export async function blockVisionCoinTrades(coinType: string, maxPages = 10): Promise<Trade[] | null> {
  if (!blockVisionEnabled()) return null;
  const out: Trade[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ coinType, limit: "50", ascendingOrder: "true" });
    if (cursor) params.set("cursor", cursor);
    const doc = await fetchJson<Response>(`${BASE}/sui/coin/trades?${params}`, {
      bucket: "blockvision",
      perMinute: PER_MINUTE,
      ttlMs: 60_000,
      headers: { "x-api-key": KEY },
      emptyOn: [404],
    });
    if (!doc) return out.length ? out : null;

    for (const row of doc.data ?? []) {
      const side = row.type === "buy" || row.type === "sell" ? row.type : null;
      const wallet = row.sender ?? "";
      const ts = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp);
      const usd = num(row.usdValue);
      const change = (row.coinChanges ?? []).find((item) => item.coinType === coinType);
      const tokens = num(change?.balance) ?? num(change?.amount);
      if (!side || !wallet || !Number.isFinite(ts) || usd === null || usd < 0 || tokens === null || tokens <= 0) continue;
      out.push({
        ts: ts < 10_000_000_000 ? ts * 1_000 : ts,
        block: null,
        tx: row.txDigest ?? "",
        wallet,
        side,
        tokens,
        usd,
      });
    }

    cursor = doc.nextPageCursor ?? null;
    if (!cursor || (doc.data ?? []).length === 0) break;
  }

  const trades = out.sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx));
  void persistTrades(coinType, trades, "blockvision");
  return trades.length ? trades : null;
}
