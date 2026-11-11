/** A token as Radar shows it: normalised from market-data sources. */
export type RadarToken = {
  /** Sui coin type, e.g. 0x2::sui::SUI */
  address: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  marketCap: number | null;
  volumeH1: number | null;
  volumeH24: number | null;
  changeH1: number | null;
  changeH24: number | null;
  liquidityUsd: number | null;
  /** Minutes since the main pool was created; null when the source reports an unknown timestamp. */
  ageMinutes: number | null;
  pairAddress: string;
  dex: string | null;
  imageUrl: string | null;
  url: string | null;
  /** Buy and sell counts over the last hour, when the source reports them. */
  buysH1?: number | null;
  sellsH1?: number | null;
};

export type RadarView = "trending" | "new" | "top";

export type Momentum = {
  /** 0 to 100. */
  score: number;
  label: "Low" | "Fair" | "Good" | "Very good";
  /** Share of tokens with a positive 1h change, 0 to 1. */
  positiveShare: number | null;
  /** Share of 1h trades that were buys, 0 to 1. */
  buyShare: number | null;
  sample: number;
};

export type RadarFeed =
  | {
      ok: true;
      view: RadarView;
      tokens: RadarToken[];
      momentum: Momentum | null;
      updatedAt: number;
    }
  | { ok: false; error: string };

/* ---------------- Leaderboard ---------------- */

export type Tier = "Diamond" | "Gold" | "Silver";

export type LeaderRow = {
  address: string;
  tier: Tier;
  /** 0 to 100. */
  score: number;
  realisedUsd: number;
  /** Realised profit from the most recent part of the window. */
  recentRealisedUsd: number;
  /** Share of closed tokens that made money, 0 to 1. */
  winRate: number;
  tokensClosed: number;
  tokensTraded: number;
  trades: number;
  boughtUsd: number;
  soldUsd: number;
  lastActiveAt: number;
  /** True when the wallet sold tokens it bought before the data window. */
  partial: boolean;
};

export type LeaderBoard = {
  rows: LeaderRow[];
  scan: {
    /** Pools whose trades were successfully read. */
    pools: number;
    /** Unique candidate pools returned by the three source lists. */
    poolsTotal: number;
    /** Candidate pools not selected for scanning, usually because of low volume or the scan cap. */
    poolsSkipped: number;
    poolsFailed: number;
    trades: number;
    wallets: number;
    windowHours: number;
    recentHours: number;
    droppedBots: number;
    droppedInconsistent: number;
  };
  updatedAt: number;
};

export type LeaderResponse =
  | { ok: true; board: LeaderBoard }
  | { ok: false; error: string };

/* ---------------- Daily report ---------------- */

export type ReportData = {
  totals: { pools: number; volumeH24: number; liquidity: number };
  runners: RadarToken[];
  dexes: { dex: string; volumeH24: number; pools: number }[];
  newest: RadarToken[];
  updatedAt: number;
};

export type ReportResponse = { ok: true; report: ReportData } | { ok: false; error: string };

/* ---------------- X-Ray ---------------- */

export type CheckLevel = "ok" | "watch" | "risk";

export type XRayCheck = {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
};

export type XRayWallet = {
  address: string;
  tier: Tier;
  roiMultiple: number | null;
  firstBuyAt: number | null;
  lastSellAt: number | null;
  buys: number;
  sells: number;
  boughtUsd: number;
  soldUsd: number;
  boughtTokens: number;
  soldTokens: number;
  /** Profit on the part that was sold. Open positions are not counted. */
  realisedUsd: number;
  averageEntryUsd: number | null;
  averageExitUsd: number | null;
  holdTimeMs: number | null;
  partial: boolean;
};

/** Internal activity summary used by the trap-check calculations. */
export type XRayActivityWallet = {
  address: string;
  firstBuyAt: number;
  buys: number;
  sells: number;
  boughtUsd: number;
  soldUsd: number;
  realisedUsd: number;
  returnMultiple: number | null;
  unrealisedUsd: number | null;
  heldShare: number;
  status: "holding" | "sold some" | "sold all";
  soldBeforeWindow: boolean;
};

export type XRaySummary = {
  trades: number;
  uniqueBuyers: number;
  uniqueSellers: number;
  buyUsd: number;
  sellUsd: number;
  topBuyerShare: number | null;
  topTenBuyShare: number | null;
  earlyHolding: number;
  earlyCount: number;
};

export type XRayCoverage = {
  kind: "complete" | "partial" | "none";
  trades: number;
  windowStart: number | null;
  windowEnd: number | null;
  note: string;
};

export type XRayResult = {
  token: {
    address: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
    priceUsd: number | null;
    marketCap: number | null;
    fdv: number | null;
    liquidityUsd: number | null;
    volumeH24: number | null;
    changeH24: number | null;
    ageMinutes: number | null;
    pairAddress: string | null;
    dex: string | null;
    hasProfile: boolean | null;
    links: { gecko: string | null; dexscreener: string | null };
  };
  coverage: XRayCoverage;
  summary: XRaySummary | null;
  checks: XRayCheck[];
  wallets: XRayWallet[];
  scan: { trades: number; walletsRead: number };
  updatedAt: number;
};

export type XRayResponse =
  | { ok: true; result: XRayResult }
  | {
      ok: false;
      error: string;
      code: "bad_input" | "not_found" | "rate_limited" | "upstream";
      retryAfterSeconds?: number;
    };
