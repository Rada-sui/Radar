import type { LeaderRow, Tier } from "@/lib/types";
import type { Trade } from "./analysis";

/* Pure wallet profit and grading logic: no network, covered by tests. */

export type PnlTrade = Trade & { token: string };

export type WalletPnl = {
  address: string;
  /** Profit on the part that was sold, from a running average cost per token. */
  realised: number;
  /** Realised profit from sells at or after `recentSince`. */
  recentRealised: number;
  boughtUsd: number;
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  /** Sold proceeds that were matched against a known buy. */
  soldMatchedUsd: number;
  /** Matched sale proceeds divided by the matched average-cost basis. */
  roiMultiple: number | null;
  buys: number;
  sells: number;
  tokensTraded: number;
  tokensClosed: number;
  wins: number;
  lastTs: number;
  firstBuyAt: number | null;
  lastSellAt: number | null;
  /** Token units sold that had no matching buy in the data window. */
  unmatchedTokens: number;
};

type Pos = { held: number; cost: number };

export function computePnl(trades: PnlTrade[], recentSince: number): WalletPnl[] {
  const ordered = [...trades].sort((a, b) => a.ts - b.ts || (a.block ?? 0) - (b.block ?? 0));

  type W = WalletPnl & { pos: Map<string, Pos>; tokenPnl: Map<string, number>; traded: Set<string> };
  const wallets = new Map<string, W>();

  for (const t of ordered) {
    let w = wallets.get(t.wallet);
    if (!w) {
      w = {
        address: t.wallet,
        realised: 0,
        recentRealised: 0,
        boughtUsd: 0,
        soldUsd: 0,
      boughtTokens: 0,
      soldTokens: 0,
        soldMatchedUsd: 0,
      roiMultiple: null,
        buys: 0,
        sells: 0,
        tokensTraded: 0,
        tokensClosed: 0,
        wins: 0,
        lastTs: 0,
      firstBuyAt: null,
      lastSellAt: null,
        unmatchedTokens: 0,
        pos: new Map(),
        tokenPnl: new Map(),
        traded: new Set(),
      };
      wallets.set(t.wallet, w);
    }
    w.traded.add(t.token);
    w.lastTs = Math.max(w.lastTs, t.ts);
    const pos = w.pos.get(t.token) ?? { held: 0, cost: 0 };

    if (t.side === "buy") {
      pos.held += t.tokens;
      pos.cost += t.usd;
      w.boughtUsd += t.usd;
      w.boughtTokens += t.tokens;
      w.firstBuyAt ??= t.ts;
      w.buys += 1;
    } else {
      w.sells += 1;
      w.soldUsd += t.usd;
      w.soldTokens += t.tokens;
      w.lastSellAt = t.ts;
      const matched = Math.min(t.tokens, pos.held);
      if (matched > 0) {
        const avg = pos.cost / pos.held;
        const basis = matched * avg;
        const proceeds = t.usd * (matched / t.tokens);
        const pnl = proceeds - basis;
        w.realised += pnl;
        if (t.ts >= recentSince) w.recentRealised += pnl;
        w.soldMatchedUsd += proceeds;
        w.tokenPnl.set(t.token, (w.tokenPnl.get(t.token) ?? 0) + pnl);
        pos.held -= matched;
        pos.cost -= basis;
      }
      w.unmatchedTokens += t.tokens - matched;
    }
    w.pos.set(t.token, pos);
  }

  return [...wallets.values()].map((w) => {
    let wins = 0;
    for (const v of w.tokenPnl.values()) if (v > 0) wins += 1;
    const matchedCost = w.soldMatchedUsd - w.realised;
    return {
      address: w.address,
      realised: w.realised,
      recentRealised: w.recentRealised,
      boughtUsd: w.boughtUsd,
      soldUsd: w.soldUsd,
      boughtTokens: w.boughtTokens,
      soldTokens: w.soldTokens,
      soldMatchedUsd: w.soldMatchedUsd,
      roiMultiple: matchedCost > 0 ? w.soldMatchedUsd / matchedCost : null,
      buys: w.buys,
      sells: w.sells,
      tokensTraded: w.traded.size,
      tokensClosed: w.tokenPnl.size,
      wins,
      lastTs: w.lastTs,
      firstBuyAt: w.firstBuyAt,
      lastSellAt: w.lastSellAt,
      unmatchedTokens: w.unmatchedTokens,
    };
  });
}

/** A wallet trading this often in a day is almost certainly a bot or a router. */
export const BOT_TRADE_LIMIT = 150;

export type Graded = {
  ranked: LeaderRow[];
  droppedBots: number;
  droppedInconsistent: number;
  droppedUnprofitable: number;
};

export type RankedWalletPnl = WalletPnl & Pick<LeaderRow, "tier" | "score" | "partial">;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function tierOf(score: number, winRate: number, tokensClosed: number): Tier {
  if (score >= 75 && tokensClosed >= 3 && winRate >= 0.6) return "Diamond";
  if (score >= 55 && tokensClosed >= 2 && winRate >= 0.5) return "Gold";
  return "Silver";
}

/**
 * Applies Radar's three ranking rules:
 *  1. Realised profit only. Open positions never count.
 *  2. Impossible figures are rejected: a wallet cannot realise more than it
 *     sold, and a non-finite figure drops the wallet.
 *  3. Recent form can only count against a wallet, never lift it.
 */
export function gradeWallets(pnls: WalletPnl[]): Graded {
  let droppedBots = 0;
  let droppedInconsistent = 0;
  let droppedUnprofitable = 0;
  const ranked: LeaderRow[] = [];

  for (const p of pnls) {
    const figures = [p.realised, p.recentRealised, p.boughtUsd, p.soldUsd, p.soldMatchedUsd];
    if (figures.some((n) => !Number.isFinite(n)) || p.realised > p.soldMatchedUsd + 1e-6) {
      droppedInconsistent += 1;
      continue;
    }
    if (p.buys + p.sells > BOT_TRADE_LIMIT) {
      droppedBots += 1;
      continue;
    }
    if (p.tokensClosed < 1 || p.realised <= 0) {
      droppedUnprofitable += 1;
      continue;
    }

    const winRate = p.wins / p.tokensClosed;
    const smoothedWinRate = (p.wins + 1) / (p.tokensClosed + 2);
    const profitPart = clamp(Math.log10(p.realised + 1) / 4, 0, 1) * 60;
    const winPart = smoothedWinRate * 25;
    const evidencePart = (Math.min(p.tokensClosed, 5) / 5) * 15;
    let score = profitPart + winPart + evidencePart;

    // Rule 3: a loss in the recent window pulls the score down. A gain does nothing.
    if (p.recentRealised < 0) {
      const drag = Math.min(0.4, (Math.abs(p.recentRealised) / Math.max(p.realised, 1)) * 0.5);
      score *= 1 - drag;
    }
    score = Math.round(clamp(score, 0, 100));

    ranked.push({
      address: p.address,
      tier: tierOf(score, winRate, p.tokensClosed),
      score,
      realisedUsd: p.realised,
      recentRealisedUsd: p.recentRealised,
      winRate,
      wins: p.wins,
      soldTokens: p.tokensClosed,
      tokensClosed: p.tokensClosed,
      tokensTraded: p.tokensTraded,
      trades: p.buys + p.sells,
      boughtUsd: p.boughtUsd,
      soldUsd: p.soldUsd,
      lastActiveAt: p.lastTs,
      firstBuyAt: p.firstBuyAt,
      lastSellAt: p.lastSellAt,
      partial: p.unmatchedTokens > 0,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.realisedUsd - a.realisedUsd);
  return { ranked, droppedBots, droppedInconsistent, droppedUnprofitable };
}

/** Applies the shared leaderboard safeguards, then ranks the accepted wallets by profit on one token. */
export function rankTokenWallets(pnls: WalletPnl[]): RankedWalletPnl[] {
  const byAddress = new Map(pnls.map((p) => [p.address, p]));
  return gradeWallets(pnls).ranked
    .map((row) => {
      const pnl = byAddress.get(row.address)!;
      return { ...pnl, tier: row.tier, score: row.score, partial: row.partial };
    })
    .sort((a, b) => b.realised - a.realised || (b.roiMultiple ?? 0) - (a.roiMultiple ?? 0));
}
