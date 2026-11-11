import { sameCoin } from "@/lib/sui";
import type {
  Momentum,
  RadarToken,
  XRayCheck,
  XRayCoverage,
  XRaySummary,
  XRayActivityWallet,
} from "@/lib/types";
import { num } from "./parse";

/* Pure analysis: no network, no server-only imports, covered by tests. */

export type Trade = {
  ts: number;
  block: number | null;
  tx: string;
  wallet: string;
  side: "buy" | "sell";
  /** Token units, already decimal-adjusted. */
  tokens: number;
  usd: number;
};

/** Gecko returns at most this many trades per call on the free tier. */
export const FREE_TRADE_CAP = 300;

export function parseTrades(raw: Record<string, unknown>[], coinType: string): Trade[] {
  const out: Trade[] = [];
  for (const a of raw) {
    if (a.is_anomalous === true) continue;
    const wallet = typeof a.tx_from_address === "string" ? a.tx_from_address : "";
    const ts = typeof a.block_timestamp === "string" ? Date.parse(a.block_timestamp) : NaN;
    const usd = num(a.volume_in_usd);
    if (!wallet || !Number.isFinite(ts) || usd === null || usd < 0) continue;

    let side: "buy" | "sell" | null = null;
    if (sameCoin(String(a.to_token_address ?? ""), coinType)) side = "buy";
    else if (sameCoin(String(a.from_token_address ?? ""), coinType)) side = "sell";
    else if (a.kind === "buy") side = "buy";
    else if (a.kind === "sell") side = "sell";
    if (!side) continue;

    const tokens = num(side === "buy" ? a.to_token_amount : a.from_token_amount);
    if (tokens === null || tokens <= 0) continue;

    out.push({
      ts,
      block: num(a.block_number),
      tx: String(a.tx_hash ?? ""),
      wallet,
      side,
      tokens,
      usd,
    });
  }
  return out.sort((x, y) => x.ts - y.ts || (x.block ?? 0) - (y.block ?? 0));
}

type Acc = {
  firstBuyAt: number;
  boughtTok: number;
  boughtUsd: number;
  soldTok: number;
  soldUsd: number;
  buys: number;
  sells: number;
};

/**
 * One row per wallet that bought inside the window.
 * Realised profit counts only the part that was sold, at that wallet's average
 * buy price. Open positions never add to it. Realised profit can never exceed
 * what the wallet actually sold.
 */
export function aggregateWallets(trades: Trade[], priceUsd: number | null): XRayActivityWallet[] {
  const by = new Map<string, Acc>();
  const sellOnly = new Map<string, Acc>();

  for (const t of trades) {
    let a = by.get(t.wallet);
    if (!a) {
      if (t.side === "sell") {
        // A wallet whose first move in the window is a sell: it got in before the window.
        let s = sellOnly.get(t.wallet);
        if (!s) {
          s = { firstBuyAt: 0, boughtTok: 0, boughtUsd: 0, soldTok: 0, soldUsd: 0, buys: 0, sells: 0 };
          sellOnly.set(t.wallet, s);
        }
        s.soldTok += t.tokens;
        s.soldUsd += t.usd;
        s.sells += 1;
        continue;
      }
      a = {
        firstBuyAt: t.ts,
        boughtTok: 0,
        boughtUsd: 0,
        soldTok: 0,
        soldUsd: 0,
        buys: 0,
        sells: 0,
      };
      by.set(t.wallet, a);
    }
    if (t.side === "buy") {
      a.boughtTok += t.tokens;
      a.boughtUsd += t.usd;
      a.buys += 1;
    } else {
      a.soldTok += t.tokens;
      a.soldUsd += t.usd;
      a.sells += 1;
    }
  }

  const rows: XRayActivityWallet[] = [];
  for (const [address, a] of by) {
    const matched = Math.min(a.soldTok, a.boughtTok);
    const soldBeforeWindow = a.soldTok > a.boughtTok * 1.001;
    const avgBuy = a.boughtTok > 0 ? a.boughtUsd / a.boughtTok : 0;
    const soldUsdMatched = a.soldTok > 0 ? a.soldUsd * (matched / a.soldTok) : 0;
    const realised = soldUsdMatched - matched * avgBuy;
    const matchedCost = matched * avgBuy;
    const held = Math.max(a.boughtTok - a.soldTok, 0);
    const heldShare = a.boughtTok > 0 ? held / a.boughtTok : 0;
    const unrealised = priceUsd !== null ? held * priceUsd - held * avgBuy : null;

    rows.push({
      address,
      firstBuyAt: a.firstBuyAt,
      buys: a.buys,
      sells: a.sells,
      boughtUsd: a.boughtUsd,
      soldUsd: a.soldUsd,
      returnMultiple: matchedCost > 0 ? soldUsdMatched / matchedCost : null,
      realisedUsd: realised,
      unrealisedUsd: unrealised,
      heldShare,
      status: heldShare > 0.95 ? "holding" : heldShare < 0.05 ? "sold all" : "sold some",
      soldBeforeWindow,
    });
  }
  return rows.sort((x, y) => x.firstBuyAt - y.firstBuyAt);
}

export function summarise(trades: Trade[], wallets: XRayActivityWallet[], earlyN = 20): XRaySummary {
  let buyUsd = 0;
  let sellUsd = 0;
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  for (const t of trades) {
    if (t.side === "buy") {
      buyUsd += t.usd;
      buyers.add(t.wallet);
    } else {
      sellUsd += t.usd;
      sellers.add(t.wallet);
    }
  }
  const byBought = [...wallets].sort((a, b) => b.boughtUsd - a.boughtUsd);
  const topBuyerShare = buyUsd > 0 && byBought[0] ? byBought[0].boughtUsd / buyUsd : null;
  const topTen = byBought.slice(0, 10).reduce((s, w) => s + w.boughtUsd, 0);
  const early = wallets.slice(0, earlyN);

  return {
    trades: trades.length,
    uniqueBuyers: buyers.size,
    uniqueSellers: sellers.size,
    buyUsd,
    sellUsd,
    topBuyerShare,
    topTenBuyShare: buyUsd > 0 ? topTen / buyUsd : null,
    earlyHolding: early.filter((w) => w.heldShare > 0.05).length,
    earlyCount: early.length,
  };
}

function spanLabel(ms: number): string {
  const mins = ms / 60_000;
  if (mins < 90) return `${Math.max(1, Math.round(mins))} minutes`;
  return `${(mins / 60).toFixed(1)} hours`;
}

/**
 * Says how much of the token's history the free trade feed actually covers.
 * "complete" is claimed only when the pool is younger than the 24h window and
 * the feed returned fewer trades than its cap, so nothing can have been cut off.
 */
export function coverageOf(trades: Trade[], poolAgeMinutes: number | null): XRayCoverage {
  if (trades.length === 0) {
    return {
      kind: "none",
      trades: 0,
      windowStart: null,
      windowEnd: null,
      note: "No trades were found in the last 24 hours, so there is no buyer history to show.",
    };
  }
  const windowStart = trades[0].ts;
  const windowEnd = trades[trades.length - 1].ts;
  const complete =
    trades.length < FREE_TRADE_CAP && poolAgeMinutes !== null && poolAgeMinutes < 24 * 60 - 15;

  if (complete) {
    return {
      kind: "complete",
      trades: trades.length,
      windowStart,
      windowEnd,
      note: "This pool is under 24 hours old and every trade fit in the free feed, so these are its true earliest buyers.",
    };
  }
  return {
    kind: "partial",
    trades: trades.length,
    windowStart,
    windowEnd,
    note: `The free feed covers only the latest ${trades.length} trades (${spanLabel(windowEnd - windowStart)}). These are the earliest buyers inside that window, not necessarily the first buyers ever.`,
  };
}

export type CheckInput = {
  summary: XRaySummary | null;
  coverage: XRayCoverage;
  liquidityUsd: number | null;
  marketCap: number | null;
  ageMinutes: number | null;
  hasProfile: boolean | null;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function computeChecks(i: CheckInput): XRayCheck[] {
  const checks: XRayCheck[] = [];
  const s = i.summary;

  if (s && s.buyUsd > 0) {
    if (s.uniqueBuyers < 8) {
      checks.push({
        id: "few-buyers",
        label: "Buyer spread",
        level: "watch",
        detail: `Only ${s.uniqueBuyers} wallets bought in this window, too few to judge concentration.`,
      });
    } else if (s.topTenBuyShare !== null) {
      checks.push({
        id: "top-ten",
        label: "Top-ten buyers",
        level: s.topTenBuyShare > 0.75 ? "risk" : s.topTenBuyShare > 0.55 ? "watch" : "ok",
        detail: `The ten biggest buyers account for ${pct(s.topTenBuyShare)} of buy volume.`,
      });
    }
    if (s.topBuyerShare !== null && s.uniqueBuyers >= 8) {
      checks.push({
        id: "top-one",
        label: "Biggest single buyer",
        level: s.topBuyerShare > 0.3 ? "risk" : s.topBuyerShare > 0.15 ? "watch" : "ok",
        detail: `One wallet accounts for ${pct(s.topBuyerShare)} of buy volume.`,
      });
    }
    if (s.sellUsd > 0) {
      const ratio = s.sellUsd / s.buyUsd;
      checks.push({
        id: "pressure",
        label: "Buys against sells",
        level: ratio > 2 ? "risk" : ratio > 1.25 ? "watch" : "ok",
        detail:
          ratio > 1
            ? `Sells are ${ratio.toFixed(1)} times buys in this window.`
            : `Buys are ${(1 / ratio).toFixed(1)} times sells in this window.`,
      });
    }
    if (i.coverage.kind === "complete" && s.earlyCount >= 10) {
      const share = s.earlyHolding / s.earlyCount;
      checks.push({
        id: "early-holders",
        label: "First 20 buyers",
        level: share < 0.3 ? "watch" : "ok",
        detail: `${s.earlyHolding} of the first ${s.earlyCount} buyers still hold some of their position.`,
      });
    }
  }

  if (i.liquidityUsd !== null && i.marketCap !== null && i.marketCap > 0 && i.liquidityUsd >= 0) {
    const r = i.liquidityUsd / i.marketCap;
    checks.push({
      id: "liquidity",
      label: "Liquidity against market cap",
      level: r < 0.02 ? "risk" : r < 0.05 ? "watch" : "ok",
      detail:
        r < 0.05
          ? `Liquidity is only ${(r * 100).toFixed(1)}% of market cap, so a large sell would move the price sharply.`
          : `Liquidity is ${(r * 100).toFixed(1)}% of market cap.`,
    });
  }

  if (i.ageMinutes !== null) {
    checks.push({
      id: "age",
      label: "Pool age",
      level: i.ageMinutes < 60 ? "watch" : "ok",
      detail:
        i.ageMinutes < 60
          ? "The pool is under an hour old. Early figures change fast."
          : "The pool has been trading for over an hour.",
    });
  }

  if (i.hasProfile !== null) {
    checks.push({
      id: "profile",
      label: "DexScreener profile",
      level: i.hasProfile ? "ok" : "watch",
      detail: i.hasProfile
        ? "The token has a website or social links listed."
        : "No website or social links are listed on DexScreener.",
    });
  }

  return checks;
}

/** A single 0 to 100 reading of how the market is moving, from a list of tokens. */
export function momentumOf(tokens: RadarToken[]): Momentum | null {
  const withChange = tokens.filter((t) => t.changeH1 !== null);
  const positiveShare = withChange.length
    ? withChange.filter((t) => (t.changeH1 ?? 0) > 0).length / withChange.length
    : null;

  let buys = 0;
  let sells = 0;
  for (const t of tokens) {
    buys += t.buysH1 ?? 0;
    sells += t.sellsH1 ?? 0;
  }
  const buyShare = buys + sells > 0 ? buys / (buys + sells) : null;

  const parts = [positiveShare, buyShare].filter((v): v is number => v !== null);
  if (parts.length === 0) return null;
  const score = Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 100);
  const label = score < 35 ? "Low" : score < 50 ? "Fair" : score < 65 ? "Good" : "Very good";
  return { score, label, positiveShare, buyShare, sample: tokens.length };
}
