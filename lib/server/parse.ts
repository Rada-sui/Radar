import type { RadarToken } from "@/lib/types";

/* Pure parsing helpers: no network, no server-only imports, easy to test. */

export type GeckoResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export type GeckoDoc = {
  data?: GeckoResource[];
  included?: GeckoResource[];
};

export type GeckoTokenInfo = {
  address: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  priceUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  liquidityUsd: number | null;
  volumeH24: number | null;
  topPools: string[];
};

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseTokenInfo(
  doc: { data?: GeckoResource } | null,
  fallbackAddress: string,
  network = "sui-network",
): GeckoTokenInfo | null {
  const d = doc?.data;
  if (!d) return null;
  const a = d.attributes ?? {};
  const pools = (d.relationships?.top_pools as { data?: { id: string }[] } | undefined)?.data ?? [];
  return {
    address: String(a.address ?? fallbackAddress),
    symbol: String(a.symbol ?? "?"),
    name: String(a.name ?? a.symbol ?? "Unknown"),
    imageUrl: typeof a.image_url === "string" && a.image_url.startsWith("http") ? a.image_url : null,
    priceUsd: num(a.price_usd),
    fdv: num(a.fdv_usd),
    marketCap: num(a.market_cap_usd),
    liquidityUsd: num(a.total_reserve_in_usd),
    volumeH24: num((a.volume_usd as Record<string, unknown> | undefined)?.h24),
    topPools: pools.map((p) => p.id.replace(`${network}_`, "")),
  };
}

function rel(r: GeckoResource, name: string): { id: string; type: string } | null {
  const d = (r.relationships?.[name] as { data?: { id: string; type: string } } | undefined)?.data;
  return d && d.id ? d : null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Majors and stablecoins are not what a memecoin radar is for. */
const SKIP_SYMBOLS = new Set(["SUI", "USDC", "USDT", "WUSDC", "WUSDT", "SUIUSDT", "WETH", "WBTC"]);

export function parsePool(
  pool: GeckoResource,
  included: Map<string, GeckoResource>,
): RadarToken | null {
  const a = pool.attributes ?? {};
  const baseRef = rel(pool, "base_token");
  if (!baseRef) return null;

  const tokenRes = included.get(`token:${baseRef.id}`) ?? included.get(`${baseRef.type}:${baseRef.id}`);
  const ta = tokenRes?.attributes ?? {};

  const address = String(ta.address ?? baseRef.id.replace(/^sui-network_/, ""));
  const nameParts = String(a.name ?? "").split(" / ");
  const symbol = String(ta.symbol ?? nameParts[0] ?? "?").trim();
  if (SKIP_SYMBOLS.has(symbol.toUpperCase())) return null;

  const dexRef = rel(pool, "dex");
  // Gecko uses the Unix epoch as a sentinel for pools whose creation time is unknown.
  const parsedCreated = typeof a.pool_created_at === "string" ? Date.parse(a.pool_created_at) : NaN;
  const created = Number.isFinite(parsedCreated) && parsedCreated > 0 ? parsedCreated : NaN;
  const poolAddress = String(a.address ?? pool.id.replace(/^sui-network_/, ""));
  const vol = obj(a.volume_usd);
  const chg = obj(a.price_change_percentage);
  const tx1 = obj(obj(a.transactions).h1);

  return {
    address,
    symbol,
    name: String(ta.name ?? symbol),
    priceUsd: num(a.base_token_price_usd),
    // Market cap is often null for unverified tokens; fall back to FDV.
    marketCap: num(a.market_cap_usd) ?? num(a.fdv_usd),
    volumeH1: num(vol.h1),
    volumeH24: num(vol.h24),
    changeH1: num(chg.h1),
    changeH24: num(chg.h24),
    liquidityUsd: num(a.reserve_in_usd),
    ageMinutes: Number.isFinite(created) ? Math.max(0, (Date.now() - created) / 60_000) : null,
    pairAddress: poolAddress,
    dex: dexRef ? dexRef.id.replace(/^sui-network_/, "") : null,
    imageUrl: typeof ta.image_url === "string" && ta.image_url.startsWith("http") ? ta.image_url : null,
    url: `https://www.geckoterminal.com/sui-network/pools/${poolAddress}`,
    buysH1: num(tx1.buys),
    sellsH1: num(tx1.sells),
  };
}
