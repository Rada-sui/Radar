import "server-only";
import { fetchJson } from "./cache";
import { persistRadarTokens } from "./persistence";
import type { RadarToken } from "@/lib/types";

const BASE = process.env.SUIPUMP_BASE ?? "https://suipump-main-web.onrender.com";
const MAX_AGE_MINUTES = 24 * 60;

type PumpStats = {
  volume_24h?: unknown;
  volume_sui?: unknown;
  last_trade_time?: unknown;
};

type PumpToken = {
  curveId?: unknown;
  tokenType?: unknown;
  symbol?: unknown;
  name?: unknown;
  description?: unknown;
  iconUrl?: unknown;
  createdAt?: unknown;
  graduated?: unknown;
  poolId?: unknown;
  stats?: PumpStats;
};

function number(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function timestamp(v: unknown): number | null {
  if (typeof v === "string" && !/^\d+(\.\d+)?$/.test(v)) {
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const n = number(v);
  if (n === null || n <= 0) return null;
  return n < 10_000_000_000 ? n * 1_000 : n;
}

function parse(row: PumpToken): RadarToken | null {
  const address = typeof row.tokenType === "string" ? row.tokenType : "";
  const curveId = typeof row.curveId === "string" ? row.curveId : "";
  const created = timestamp(row.createdAt);
  if (!address || !curveId || created === null) return null;
  const ageMinutes = Math.max(0, (Date.now() - created) / 60_000);
  if (ageMinutes > MAX_AGE_MINUTES) return null;
  const stats = row.stats ?? {};
  return {
    address,
    symbol: typeof row.symbol === "string" ? row.symbol : "?",
    name: typeof row.name === "string" ? row.name : "Unknown token",
    priceUsd: null,
    marketCap: null,
    volumeH1: null,
    volumeH24: null,
    changeH1: null,
    changeH24: null,
    liquidityUsd: null,
    ageMinutes,
    pairAddress: curveId,
    dex: "suipump",
    imageUrl: typeof row.iconUrl === "string" && row.iconUrl.startsWith("http") ? row.iconUrl : null,
    url: `https://suipump.org/token/${curveId}`,
    buysH1: null,
    sellsH1: null,
    // Keep launchpad-native values available to server consumers without
    // pretending SUI-denominated volume is USD-denominated market volume.
    suipump: {
      graduated: row.graduated === true,
      poolId: typeof row.poolId === "string" ? row.poolId : null,
      volumeSui: number(stats.volume_sui),
      lastTradeAt: timestamp(stats.last_trade_time),
    },
  } as RadarToken;
}

export async function newSuiPumpTokens(): Promise<RadarToken[]> {
  const doc = await fetchJson<unknown>(`${BASE}/tokens`, {
    bucket: "suipump",
    perMinute: 12,
    ttlMs: 10_000,
    headers: { accept: "application/json" },
    emptyOn: [404],
  });
  if (!Array.isArray(doc)) return [];
  const tokens = doc.map((row) => row && typeof row === "object" ? parse(row as PumpToken) : null).filter((row): row is RadarToken => row !== null);
  void persistRadarTokens(tokens, "suipump");
  return tokens;
}
