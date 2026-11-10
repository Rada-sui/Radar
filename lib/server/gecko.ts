import "server-only";
import { fetchJson } from "./cache";
import { parsePool, parseTokenInfo, type GeckoDoc, type GeckoResource, type GeckoTokenInfo } from "./parse";
import type { RadarToken } from "@/lib/types";

// GeckoTerminal's free, keyless API. Network id for Sui is "sui-network".
// GECKO_BASE can point at a mock or proxy, e.g. for tests.
const BASE = process.env.GECKO_BASE ?? "https://api.geckoterminal.com/api/v2";
const NETWORK = "sui-network";
const HEADERS = { accept: "application/json;version=20230302" };
// The public limit is about 30 calls a minute; stay under it.
const PER_MINUTE = 24;

function get<T>(path: string, ttlMs: number) {
  return fetchJson<T>(`${BASE}${path}`, {
    bucket: "geckoterminal",
    perMinute: PER_MINUTE,
    ttlMs,
    headers: HEADERS,
    emptyOn: [404],
  });
}

const POOL_INCLUDE = "include=base_token,dex";

/** Pools turned into one row per base token, keeping the first (best ranked) pool. */
function toTokens(doc: GeckoDoc | null): RadarToken[] {
  if (!doc) return [];
  const included = new Map<string, GeckoResource>();
  for (const r of doc.included ?? []) included.set(`${r.type}:${r.id}`, r);

  const seen = new Set<string>();
  const out: RadarToken[] = [];
  for (const pool of doc.data ?? []) {
    const t = parsePool(pool, included);
    if (!t || seen.has(t.address)) continue;
    seen.add(t.address);
    out.push(t);
  }
  return out;
}

export async function trendingTokens(duration: "5m" | "1h" | "6h" | "24h" = "1h") {
  const doc = await get<GeckoDoc>(
    `/networks/${NETWORK}/trending_pools?${POOL_INCLUDE}&duration=${duration}`,
    60_000,
  );
  return toTokens(doc);
}

export async function newTokens() {
  const doc = await get<GeckoDoc>(`/networks/${NETWORK}/new_pools?${POOL_INCLUDE}`, 45_000);
  return toTokens(doc);
}

export async function topTokens() {
  const doc = await get<GeckoDoc>(
    `/networks/${NETWORK}/pools?${POOL_INCLUDE}&sort=h24_volume_usd_desc`,
    90_000,
  );
  return toTokens(doc);
}

export async function tokenInfo(coinType: string): Promise<GeckoTokenInfo | null> {
  const doc = await get<{ data?: GeckoResource }>(
    `/networks/${NETWORK}/tokens/${encodeURIComponent(coinType)}`,
    60_000,
  );
  return parseTokenInfo(doc, coinType, NETWORK);
}

export type RawTrade = Record<string, unknown>;

/** The last 300 trades from the past 24 hours (the most the free API returns). */
export async function poolTrades(poolAddress: string, coinType: string): Promise<RawTrade[] | null> {
  const doc = await get<{ data?: { attributes?: RawTrade }[] }>(
    `/networks/${NETWORK}/pools/${encodeURIComponent(poolAddress)}/trades?token=${encodeURIComponent(coinType)}`,
    45_000,
  );
  if (!doc) return null;
  return (doc.data ?? []).map((d) => d.attributes ?? {});
}
