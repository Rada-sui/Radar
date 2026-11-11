import "server-only";
import type { RadarToken, ReportResponse } from "@/lib/types";
import { newTokens, topTokens, trendingTokens } from "./gecko";

/**
 * Daily report, built from the pools Radar already reads: top volume,
 * trending and new. It describes those pools, not the whole chain.
 */
export function buildReport(lists: RadarToken[][], now = Date.now()) {
  const byToken = new Map<string, RadarToken>();
  for (const list of lists) {
    for (const t of list) {
      const existing = byToken.get(t.address);
      // The same token can appear in several pools. Prefer a real pool age
      // over GeckoTerminal's unknown-timestamp sentinel, while preserving the
      // first list's values for every other field.
      if (!existing || (existing.ageMinutes === null && t.ageMinutes !== null)) byToken.set(t.address, t);
    }
  }
  const all = [...byToken.values()];

  // Ignore pools too thin to act on when naming the day's best runners.
  const runners = all
    .filter((t) => t.changeH24 !== null && (t.liquidityUsd ?? 0) >= 5_000)
    .sort((a, b) => (b.changeH24 ?? 0) - (a.changeH24 ?? 0))
    .slice(0, 10);

  const dexMap = new Map<string, { volumeH24: number; pools: number }>();
  for (const t of all) {
    const key = t.dex ?? "unknown";
    const cur = dexMap.get(key) ?? { volumeH24: 0, pools: 0 };
    cur.volumeH24 += t.volumeH24 ?? 0;
    cur.pools += 1;
    dexMap.set(key, cur);
  }
  const dexes = [...dexMap.entries()]
    .map(([dex, v]) => ({ dex, ...v }))
    .sort((a, b) => b.volumeH24 - a.volumeH24);

  const newest = [...all]
    .filter((t) => t.ageMinutes !== null)
    .sort((a, b) => (a.ageMinutes ?? 0) - (b.ageMinutes ?? 0))
    .slice(0, 8);

  return {
    totals: {
      pools: all.length,
      volumeH24: all.reduce((s, t) => s + (t.volumeH24 ?? 0), 0),
      liquidity: all.reduce((s, t) => s + (t.liquidityUsd ?? 0), 0),
    },
    runners,
    dexes,
    newest,
    updatedAt: now,
  };
}

export async function getReport(): Promise<{ body: ReportResponse; status: number }> {
  const settled = await Promise.allSettled([topTokens(), trendingTokens("24h"), newTokens()]);
  const lists = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (lists.length === 0 || lists.every((l) => l.length === 0)) {
    return {
      body: { ok: false, error: "The market data source did not respond. Try again in a minute." },
      status: 502,
    };
  }
  return { body: { ok: true, report: buildReport(lists) }, status: 200 };
}
