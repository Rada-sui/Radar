import "server-only";
import { fetchJson } from "./cache";
import { num } from "./parse";

// DexScreener's free API. Documented limits are 60/min on profile endpoints
// and 300/min on pair endpoints; stay well under both.
// DEXSCREENER_BASE can point at a mock or proxy, e.g. for tests.
const BASE = process.env.DEXSCREENER_BASE ?? "https://api.dexscreener.com";

export type DexPair = {
  pairAddress: string;
  dexId: string | null;
  url: string | null;
  baseAddress: string;
  baseSymbol: string;
  baseName: string;
  quoteSymbol: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volumeH24: number | null;
  changeH24: number | null;
  marketCap: number | null;
  fdv: number | null;
  createdAt: number | null;
  imageUrl: string | null;
  /** True when the pair has a token profile (website or socials) on DexScreener. */
  hasProfile: boolean;
};

type RawPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string | null;
  liquidity?: { usd?: number | null } | null;
  volume?: Record<string, number | null> | null;
  priceChange?: Record<string, number | null> | null;
  marketCap?: number | null;
  fdv?: number | null;
  pairCreatedAt?: number | null;
  info?: { imageUrl?: string; websites?: unknown[]; socials?: unknown[] } | null;
};

export function parsePair(p: RawPair): DexPair | null {
  if (p.chainId && p.chainId !== "sui") return null;
  if (!p.pairAddress || !p.baseToken?.address) return null;
  const info = p.info ?? null;
  return {
    pairAddress: p.pairAddress,
    dexId: p.dexId ?? null,
    url: p.url ?? null,
    baseAddress: p.baseToken.address,
    baseSymbol: p.baseToken.symbol ?? "?",
    baseName: p.baseToken.name ?? p.baseToken.symbol ?? "Unknown",
    quoteSymbol: p.quoteToken?.symbol ?? null,
    priceUsd: num(p.priceUsd),
    liquidityUsd: num(p.liquidity?.usd),
    volumeH24: num(p.volume?.h24),
    changeH24: num(p.priceChange?.h24),
    marketCap: num(p.marketCap),
    fdv: num(p.fdv),
    createdAt: num(p.pairCreatedAt),
    imageUrl: info?.imageUrl && info.imageUrl.startsWith("http") ? info.imageUrl : null,
    hasProfile: Boolean(info && ((info.websites?.length ?? 0) > 0 || (info.socials?.length ?? 0) > 0)),
  };
}

/** All Sui pairs for a token, best liquidity first. */
export async function tokenPairs(coinType: string): Promise<DexPair[]> {
  const raw = await fetchJson<RawPair[]>(
    `${BASE}/token-pairs/v1/sui/${encodeURIComponent(coinType)}`,
    { bucket: "dexscreener", perMinute: 100, ttlMs: 45_000, emptyOn: [404] },
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .map(parsePair)
    .filter((p): p is DexPair => p !== null)
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0));
}
