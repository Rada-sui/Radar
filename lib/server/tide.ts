import "server-only";
import { sameCoin } from "@/lib/sui";
import type { Trade } from "./analysis";
import type { TideHolders, TideLifetime, TideStatus } from "@/lib/types";
import { fetchJson } from "./cache";
import { parseCoinPnl, parseHolders, parseWalletPnl, summariseWalletPnl, type WalletLifetime, type WalletPnlRow } from "./tide-parse";

/*
 * Tide (tide.ad): the authoritative wallet-performance source for Sui.
 * Radar uses it for:
 *  - each top wallet's whole history in the token (wallet.coinPnl), and
 *  - the token's top holders (coins.holders), for the holder-concentration check.
 *
 * Wallet-performance consumers fail explicitly when it is not configured or
 * cannot answer; they must not silently substitute Gecko's partial trade feed.
 */

const BASE = process.env.TIDE_BASE ?? "https://api.tide.ad";
const KEY = process.env.TIDE_API_KEY?.trim() || "";

/** Credits per call, from Tide's docs. */
const COST = { holders: 5, coinPnl: 10, walletPnl: 10 } as const;

/** Radar's own ceiling on credits per UTC day, so a busy day cannot burn the monthly allowance. */
const dailyCredits = () => (Number(process.env.TIDE_DAILY_CREDITS) > 0 ? Number(process.env.TIDE_DAILY_CREDITS) : 100_000);

/** Calls per minute. Tide's free plan allows about 5 heavy requests a second; stay well under it. */
const PER_MINUTE = 90;

/** How many of the top wallets get a whole-history lookup per scan (10 credits each). */
/** Keep X-Ray enrichment affordable; the full candidate set is still ranked locally. */
export const WALLET_LOOKUPS = 5;
const CONCURRENCY = 3;
/** X-Ray never waits longer than this for Tide; whatever has arrived by then is used. */
const DEADLINE_MS = 8_000;

const HOLDERS_TTL = 10 * 60_000;
const PNL_TTL = 5 * 60_000;
const TRADE_TTL = 5 * 60_000;

export const tideEnabled = () => KEY !== "";

type Meter = { day: string; used: number };
const g = globalThis as unknown as { __radarTide?: Meter };

/** Counts credits when a call is made. Cached repeats are counted too, so this errs on the safe side. */
function takeCredits(cost: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const m = (g.__radarTide ??= { day, used: 0 });
  if (m.day !== day) {
    m.day = day;
    m.used = 0;
  }
  if (m.used + cost > dailyCredits()) return false;
  m.used += cost;
  return true;
}

/** Test helper. */
export function __resetTideMeter() {
  g.__radarTide = undefined;
}

function get(path: string, ttlMs: number) {
  return fetchJson<unknown>(`${BASE}${path}`, {
    bucket: "tide",
    perMinute: PER_MINUTE,
    ttlMs,
    headers: { "x-api-key": KEY },
    emptyOn: [404],
  });
}

type SqlResponse = {
  execution_id?: string;
  state?: string;
  is_execution_finished?: boolean;
  result?: { rows?: Record<string, unknown>[] };
};

/**
 * Tide has no REST endpoint that enumerates profitable wallets for an arbitrary
 * coin. Its SQL DEX table is the authoritative token-wide trade source.
 */
export async function tideCoinTrades(coinType: string): Promise<Trade[] | null> {
  if (!tideEnabled() || !takeCredits(20)) return null;
  const sql = `SELECT sender, block_time, transaction_digest, event_index,
    token_sold_address, token_bought_address, token_sold_amount, token_bought_amount,
    token_sold_usd, token_bought_usd
    FROM dex.trades
    WHERE token_sold_address = {{coin}} OR token_bought_address = {{coin}}
    LIMIT 10000`;
  const doc = await fetchJson<SqlResponse>(`${BASE}/v1/sql/execute`, {
    bucket: "tide",
    perMinute: PER_MINUTE,
    ttlMs: TRADE_TTL,
    method: "POST",
    headers: { "x-api-key": KEY, "content-type": "application/json" },
    body: JSON.stringify({ sql, dialect: "trino", wait_ms: 10_000, params: { coin: coinType } }),
  });
  let rows = doc?.result?.rows;
  let executionId = doc?.execution_id;
  let finished = doc?.is_execution_finished === true;
  if (!finished && executionId) {
    const status = await fetchJson<SqlResponse>(
      `${BASE}/v1/execution/${encodeURIComponent(executionId)}/status?wait_ms=10_000`,
      { bucket: "tide", perMinute: PER_MINUTE, ttlMs: TRADE_TTL, headers: { "x-api-key": KEY } },
    );
    rows = status?.result?.rows;
    executionId = status?.execution_id ?? executionId;
    finished = status?.is_execution_finished === true || status?.state === "QUERY_STATE_COMPLETED";
  }
  // Tide may complete a query without embedding rows in the execute response.
  // In that case the documented results endpoint must be read using the id.
  if (!rows && executionId && finished) {
    const resultDoc = await fetchJson<{ result?: { rows?: Record<string, unknown>[] } }>(
      `${BASE}/v1/execution/${encodeURIComponent(executionId)}/results?limit=10000&offset=0`,
      { bucket: "tide", perMinute: PER_MINUTE, ttlMs: TRADE_TTL, headers: { "x-api-key": KEY } },
    );
    rows = resultDoc?.result?.rows;
  }
  if (!rows) return null;
  const out: Trade[] = [];
  for (const row of rows) {
    const wallet = typeof row.sender === "string" ? row.sender : "";
    const ts = typeof row.block_time === "string" ? Date.parse(`${row.block_time}Z`) : NaN;
    const soldAddress = typeof row.token_sold_address === "string" ? row.token_sold_address : "";
    const boughtAddress = typeof row.token_bought_address === "string" ? row.token_bought_address : "";
    const side = sameCoin(boughtAddress, coinType) ? "buy" : sameCoin(soldAddress, coinType) ? "sell" : null;
    const tokens = Number(side === "buy" ? row.token_bought_amount : row.token_sold_amount);
    const usd = Number(side === "buy" ? row.token_bought_usd : row.token_sold_usd);
    if (!wallet || !side || !Number.isFinite(ts) || tokens <= 0 || !Number.isFinite(usd) || usd < 0) continue;
    out.push({ ts, block: null, tx: String(row.transaction_digest ?? ""), wallet, side, tokens, usd });
  }
  return out.sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx));
}

export async function tideHolders(coinType: string): Promise<TideHolders | null> {
  if (!tideEnabled() || !takeCredits(COST.holders)) return null;
  const doc = await get(`/v1/coins/${encodeURIComponent(coinType)}/holders?limit=20`, HOLDERS_TTL);
  return parseHolders(doc);
}

export async function tideCoinPnl(wallet: string, coinType: string): Promise<TideLifetime | null> {
  if (!tideEnabled() || !takeCredits(COST.coinPnl)) return null;
  // Coin types are plain path-safe characters, and Tide's own example uses them unencoded.
  const doc = await get(`/v1/wallet/${encodeURIComponent(wallet)}/pnl/${coinType}`, PNL_TTL);
  return parseCoinPnl(doc);
}

/** Pages of per-coin results read for one wallet. Each page costs 10 credits. */
const WALLET_PAGES = 4;
const WALLET_PNL_TTL = 30 * 60_000;

/**
 * A wallet's realised profit across every coin it traded (wallet.pnl, newest figures first by profit).
 * Returns null when Tide has nothing usable. `complete` is false when pages were left unread or the
 * response never said whether more existed, so callers must not trust the win rate of such a wallet.
 */
export async function tideWalletLifetime(wallet: string): Promise<WalletLifetime | null> {
  if (!tideEnabled()) return null;
  const rows: WalletPnlRow[] = [];
  let cursor: string | null = null;
  let complete = false;
  for (let page = 0; page < WALLET_PAGES; page++) {
    if (!takeCredits(COST.walletPnl)) return rows.length ? summariseWalletPnl(rows, false) : null;
    const q = `sort=realized&dir=desc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const doc = await get(`/v1/wallet/${encodeURIComponent(wallet)}/pnl?${q}`, WALLET_PNL_TTL);
    const parsed = parseWalletPnl(doc);
    if (!parsed) return rows.length ? summariseWalletPnl(rows, false) : null;
    rows.push(...parsed.rows);
    if (parsed.next === null) {
      complete = true;
      break;
    }
    // No cursor field at all: we cannot tell whether this was everything, so call it incomplete.
    if (parsed.next === undefined) break;
    cursor = parsed.next;
  }
  return summariseWalletPnl(rows, complete);
}

/** Looks up many wallets with a small worker pool and a deadline. Never throws. */
export async function tideWalletBatch(wallets: string[], deadlineMs = 15_000): Promise<Map<string, WalletLifetime>> {
  const out = new Map<string, WalletLifetime>();
  if (!tideEnabled()) return out;
  const queue = [...wallets];
  const worker = async () => {
    for (let w = queue.shift(); w !== undefined; w = queue.shift()) {
      try {
        const r = await tideWalletLifetime(w);
        if (r) out.set(w, r);
      } catch {
        /* Tide is optional. */
      }
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs);
  });
  await Promise.race([Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker)).then(() => undefined), deadline]);
  clearTimeout(timer);
  return new Map(out);
}

export type TideEnrichment = {
  status: TideStatus;
  holders: TideHolders | null;
  lifetime: Map<string, TideLifetime>;
  walletsChecked: number;
};

/**
 * Looks up the holder list and each wallet's whole history in the token.
 * Never throws and never waits past the deadline.
 */
export async function enrichWithTide(coinType: string, wallets: string[]): Promise<TideEnrichment> {
  if (!tideEnabled()) return { status: "off", holders: null, lifetime: new Map(), walletsChecked: 0 };

  const targets = wallets.slice(0, WALLET_LOOKUPS);
  let holders: TideHolders | null = null;
  const lifetime = new Map<string, TideLifetime>();
  let asked = 0;
  let answered = 0;

  const holdersTask = (async () => {
    asked += 1;
    try {
      holders = await tideHolders(coinType);
      if (holders) answered += 1;
    } catch {
      /* Tide is optional. */
    }
  })();

  const queue = [...targets];
  const worker = async () => {
    for (let w = queue.shift(); w !== undefined; w = queue.shift()) {
      asked += 1;
      try {
        const row = await tideCoinPnl(w, coinType);
        if (row) {
          lifetime.set(w, row);
          answered += 1;
        }
      } catch {
        /* Tide is optional. */
      }
    }
  };
  const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DEADLINE_MS);
  });
  await Promise.race([Promise.all([holdersTask, ...workers]).then(() => undefined), deadline]);
  clearTimeout(timer);

  // Anything still in flight is left out; its late result lands in the originals, not this snapshot.
  const snapshot = new Map(lifetime);
  const status: TideStatus = answered === 0 ? "unavailable" : answered >= asked ? "ok" : "partial";
  return { status, holders, lifetime: snapshot, walletsChecked: snapshot.size };
}
