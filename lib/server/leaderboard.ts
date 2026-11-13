import "server-only";
import type { LeaderBoard, LeaderResponse, RadarToken } from "@/lib/types";
import { parseTrades } from "./analysis";
import { newTokens, poolTrades, topTokens, trendingTokens } from "./gecko";
import { computePnl, gradeWallets, type PnlTrade } from "./pnl";

/**
 * Builds the wallet board from the free GeckoTerminal trade feed.
 * The feed gives the latest 300 trades per pool, so the board covers the
 * most active pools over the last day, not a wallet's full history. The
 * number of pools is capped to stay inside the free rate limit and leave
 * room for X-Ray scans.
 */
// Leave room in GeckoTerminal's rolling budget for the other platform feeds.
const MAX_POOLS = 8;
const WINDOW_HOURS = 24;
const RECENT_HOURS = 6;
const BOARD_TTL_MS = 10 * 60_000;
const BOARD_SIZE = 50;

export function scanCounts(total: number, selected: number, failed: number) {
  const safeTotal = Math.max(0, total);
  const safeSelected = Math.min(safeTotal, Math.max(0, selected));
  const safeFailed = Math.min(safeSelected, Math.max(0, failed));
  return {
    pools: safeSelected - safeFailed,
    poolsTotal: safeTotal,
    poolsSkipped: safeTotal - safeSelected,
    poolsFailed: safeFailed,
  };
}

type Memo = { at: number; value: LeaderBoard | null; building: Promise<LeaderBoard> | null; failedAt: number };
const g = globalThis as unknown as { __radarBoard?: Memo };
const memo: Memo = (g.__radarBoard ??= { at: 0, value: null, building: null, failedAt: 0 });

async function pickPools(): Promise<{ pools: RadarToken[]; total: number; skipped: number }> {
  const lists = await Promise.allSettled([topTokens(), trendingTokens("1h"), newTokens()]);
  const seen = new Set<string>();
  const candidates: RadarToken[] = [];
  // Interleave the lists so one of them cannot crowd out the others.
  const ok = lists.flatMap((l) => (l.status === "fulfilled" ? [l.value] : []));
  const longest = Math.max(0, ...ok.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of ok) {
      const tok = list[i];
      if (!tok || seen.has(tok.address)) continue;
      seen.add(tok.address);
      candidates.push(tok);
    }
  }
  const eligible = candidates.filter((tok) => (tok.volumeH24 ?? 0) >= 1_000);
  return { pools: eligible.slice(0, MAX_POOLS), total: candidates.length, skipped: candidates.length - Math.min(eligible.length, MAX_POOLS) };
}

async function build(): Promise<LeaderBoard> {
  const selection = await pickPools();
  const pools = selection.pools;
  if (pools.length === 0) throw new Error("no pools");

  const results = await Promise.allSettled(
    pools.map(async (p) => {
      const raw = await poolTrades(p.pairAddress, p.address);
      return { token: p.address, trades: raw ? parseTrades(raw, p.address) : [] };
    }),
  );

  const all: PnlTrade[] = [];
  let failed = 0;
  let scanned = 0;
  for (const r of results) {
    if (r.status === "rejected") {
      failed += 1;
      continue;
    }
    scanned += 1;
    for (const t of r.value.trades) all.push({ ...t, token: r.value.token });
  }
  if (scanned === 0) throw new Error("no trades");

  const now = Date.now();
  const pnls = computePnl(all, now - RECENT_HOURS * 3_600_000);
  const graded = gradeWallets(pnls);

  // The leaderboard is intentionally Gecko/Dex market-data-only for now.
  // Tide credits are reserved for X-Ray's token-specific all-time scan.
  const rows = graded.ranked.slice(0, BOARD_SIZE);
  const basis = "24h" as const;

  return {
    rows,
    scan: {
      basis,
      ...scanCounts(selection.total, pools.length, failed),
      trades: all.length,
      wallets: pnls.length,
      windowHours: WINDOW_HOURS,
      recentHours: RECENT_HOURS,
      droppedBots: graded.droppedBots,
      droppedInconsistent: graded.droppedInconsistent,
    },
    updatedAt: now,
  };
}

/** Serves the cached board, rebuilding in the background once it is stale. */
export async function getLeaderBoard(): Promise<LeaderResponse> {
  const now = Date.now();
  const ttl = BOARD_TTL_MS;
  const fresh = memo.value && now - memo.at < ttl;

  // Do not turn an upstream outage or rate limit into a retry storm. The
  // shared Gecko budget is also used by Radar, Launches and Reports.
  if (!fresh && !memo.value && memo.failedAt && now - memo.failedAt < 30_000) {
    return {
      ok: false,
      error: "The leaderboard data source is busy. Try again in a few seconds.",
    };
  }

  if (!fresh && !memo.building) {
    memo.building = build()
      .then((v) => {
        memo.value = v;
        memo.at = Date.now();
        return v;
      })
      .finally(() => {
        memo.building = null;
      });
    // A background rebuild that fails must not become an unhandled rejection.
    memo.building.catch(() => {
      memo.failedAt = Date.now();
    });
  }

  if (memo.value && !fresh && memo.building) return { ok: true, board: memo.value };
  if (fresh && memo.value) return { ok: true, board: memo.value };

  try {
    const board = await memo.building!;
    return { ok: true, board };
  } catch {
    memo.failedAt = Date.now();
    return {
      ok: false,
      error: "The free data sources could not supply enough trades to build the board. Try again in a minute.",
    };
  }
}
