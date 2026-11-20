import "server-only";

import { fetchJson } from "./cache";

const BASE = process.env.BLOCKBERRY_BASE ?? "https://api.blockberry.one/sui/v1";
const KEY = process.env.BLOCKBERRY_API_KEY?.trim() ?? "";

type RawCoin = {
  coinName?: string;
  name?: string;
  coinSymbol?: string;
  symbol?: string;
  imgUrl?: string;
  imageUrl?: string;
  securityMessage?: string | null;
};

type RawResponse = RawCoin | { data?: RawCoin };

export type BlockberryCoinInfo = {
  name: string | null;
  symbol: string | null;
  imageUrl: string | null;
  securityMessage: string | null;
};

export const blockberryEnabled = () => KEY.length > 0;

/** Optional Sui metadata/security enrichment. It never becomes a required scan dependency. */
export async function blockberryCoinInfo(coinType: string): Promise<BlockberryCoinInfo | null> {
  if (!blockberryEnabled()) return null;
  const doc = await fetchJson<RawResponse>(`${BASE}/coins/${encodeURIComponent(coinType)}`, {
    bucket: "blockberry",
    perMinute: 30,
    ttlMs: 10 * 60_000,
    headers: { "x-api-key": KEY },
    emptyOn: [404],
  });
  if (!doc) return null;
  const row: RawCoin = "data" in doc ? (doc.data ?? {}) : (doc as RawCoin);
  const imageUrl = row.imgUrl ?? row.imageUrl;
  return {
    name: row.coinName ?? row.name ?? null,
    symbol: row.coinSymbol ?? row.symbol ?? null,
    imageUrl: typeof imageUrl === "string" ? imageUrl : null,
    securityMessage: row.securityMessage ?? null,
  };
}
