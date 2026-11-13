import type { LeaderRow } from "@/lib/types";
import { scoreOf, tierOf } from "./pnl";
import type { WalletLifetime } from "./tide-parse";

/**
 * Re-ranks wallets that were profitable in the last 24 hours on their whole-history record from Tide.
 * Pure, so the rules are tested on their own.
 *
 *  - Only realised profit counts, and the wallet must be net profitable over its history.
 *  - Win rate is winning coins over coins it actually sold: 50 / 73, not a percentage of one trade.
 *  - A wallet whose history Tide could not read in full is shown, marked partial, and capped at Silver,
 *    because missing coins would skew its win rate.
 *  - Rule 3 still applies: a loss in the recent 24h window lowers the score; a gain never raises it.
 */
export function gradeLifetime(
  candidates: LeaderRow[],
  stats: Map<string, WalletLifetime>,
): { rows: LeaderRow[]; answered: number; incomplete: number; dropped: number } {
  const rows: LeaderRow[] = [];
  let answered = 0;
  let incomplete = 0;
  let dropped = 0;

  for (const c of candidates) {
    const s = stats.get(c.address);
    if (!s) continue;
    answered += 1;
    if (!Number.isFinite(s.realisedUsd) || s.realisedUsd <= 0 || s.closed < 1) {
      dropped += 1;
      continue;
    }
    if (!s.complete) incomplete += 1;
    const score = scoreOf(s.realisedUsd, c.recentRealisedUsd, s.wins, s.closed);
    rows.push({
      address: c.address,
      tier: s.complete ? tierOf(score, s.wins / s.closed, s.closed) : "Silver",
      score,
      realisedUsd: s.realisedUsd,
      recentRealisedUsd: c.recentRealisedUsd,
      winRate: s.wins / s.closed,
      wins: s.wins,
      soldTokens: s.closed,
      tokensClosed: s.closed,
      tokensTraded: s.traded,
      trades: c.trades,
      boughtUsd: c.boughtUsd,
      soldUsd: c.soldUsd,
      lastActiveAt: c.lastActiveAt,
      firstBuyAt: null,
      lastSellAt: c.lastSellAt,
      partial: !s.complete,
      basis: "lifetime",
      realised24hUsd: c.realisedUsd,
    });
  }
  rows.sort((a, b) => b.score - a.score || b.realisedUsd - a.realisedUsd);
  return { rows, answered, incomplete, dropped };
}
