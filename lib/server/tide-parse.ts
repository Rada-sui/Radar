import type { TideHolders, TideHolder, TideLifetime, XRayCheck } from "@/lib/types";

/*
 * Pure parsing for Tide (tide.ad) responses. No network, covered by tests.
 *
 * Tide's public docs name the fields but do not publish a JSON schema, so these
 * parsers are strict about what they must find and tolerant about shape:
 *  - the body may be wrapped in `data` or `result`, or be bare;
 *  - numbers may be numbers or numeric strings;
 *  - times may be milliseconds, seconds or ISO strings.
 * If the fields Radar depends on are missing, the parser returns null and the
 * caller treats Tide as unavailable. It never guesses a figure.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Milliseconds from a ms number, a seconds number or an ISO date string. */
export function timeMs(v: unknown): number | null {
  const n = num(v);
  if (n !== null) {
    if (n <= 0) return null;
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function unwrap(doc: unknown): Obj | null {
  if (!isObj(doc)) return null;
  for (const key of ["data", "result"]) {
    const inner = doc[key];
    if (isObj(inner)) return inner;
  }
  return doc;
}

function first(o: Obj, keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

/** Reads `{ usd, amount, swaps }` style legs, tolerating a few common spellings. */
function leg(v: unknown): { usd: number | null; swaps: number | null } {
  if (!isObj(v)) return { usd: null, swaps: null };
  return {
    usd: num(first(v, ["usd", "valueUsd", "usdValue"])),
    swaps: num(first(v, ["swaps", "trades", "count", "n"])),
  };
}

export function parseCoinPnl(doc: unknown): TideLifetime | null {
  const o = unwrap(doc);
  if (!o) return null;

  const realisedUsd = num(o.realizedUsd);
  const unrealisedUsd = num(o.unrealizedUsd);
  const pnlUsd = num(o.pnlUsd);
  // Without any profit figure there is nothing trustworthy to show.
  if (realisedUsd === null && pnlUsd === null) return null;

  const bought = leg(o.bought);
  const sold = leg(o.sold);
  const status = str(o.status);
  const notes = Array.isArray(o.notes)
    ? o.notes.filter((n): n is string => typeof n === "string")
    : typeof o.notes === "string" && o.notes.trim()
      ? [o.notes.trim()]
      : [];

  return {
    realisedUsd,
    unrealisedUsd,
    pnlUsd,
    roiPct: num(o.roiPct),
    boughtUsd: bought.usd,
    soldUsd: sold.usd,
    swaps: bought.swaps !== null || sold.swaps !== null ? (bought.swaps ?? 0) + (sold.swaps ?? 0) : null,
    avgBuyUsd: num(o.avgBuyUsd),
    avgSellUsd: num(o.avgSellUsd),
    status: status === "holding" || status === "exited" || status === "none" ? status : null,
    firstBuyAt: timeMs(o.firstBuy),
    lastTradeAt: timeMs(o.lastTrade),
    complete: typeof o.complete === "boolean" ? o.complete : null,
    notes,
  };
}

/** Holder kinds that are market plumbing rather than people, so they are left out of concentration. */
const INFRA_KIND = /pool|lp|vault|burn|bridge|exchange|dex|contract|treasury|locker|lock/i;

export function parseHolders(doc: unknown): TideHolders | null {
  let rows: unknown;
  if (Array.isArray(doc)) rows = doc;
  else {
    const o = unwrap(doc);
    if (!o) return null;
    rows = first(o, ["holders", "items", "rows", "results", "data"]);
  }
  if (!Array.isArray(rows)) return null;

  const holders: TideHolder[] = [];
  for (const row of rows) {
    if (!isObj(row)) continue;
    let address: string | null = null;
    let label: string | null = null;
    const owner = row.owner;
    if (typeof owner === "string") address = owner;
    else if (isObj(owner)) {
      address = str(first(owner, ["address", "id", "owner"]));
      label = str(first(owner, ["label", "name", "suins", "suiNs"]));
    }
    address ??= str(first(row, ["address", "wallet"]));
    label ??= str(first(row, ["label", "name"]));
    const pct = num(row.pctSupply);
    if (!address || pct === null || pct < 0 || pct > 100) continue;
    const value = isObj(row.value) ? num(row.value.usd) : num(row.value);
    holders.push({
      rank: num(row.rank) ?? holders.length + 1,
      address,
      label,
      pctSupply: pct,
      valueUsd: value,
      kind: str(row.kind),
    });
  }
  if (holders.length === 0) return null;

  // pctSupply is read as a percentage (0 to 100). A column that adds up to more than that is not one.
  const total = holders.reduce((s, h) => s + h.pctSupply, 0);
  if (total > 100.5) return null;

  holders.sort((a, b) => a.rank - b.rank);
  const people = holders.filter((h) => !h.kind || !INFRA_KIND.test(h.kind));
  const top = people.slice(0, 10);
  return {
    holders,
    topOnePct: people[0]?.pctSupply ?? null,
    topTenPct: top.length >= 10 ? top.reduce((s, h) => s + h.pctSupply, 0) : null,
    excluded: holders.length - people.length,
  };
}

const pct1 = (n: number) => `${n.toFixed(1)}%`;

/** A trap-check row from Tide's holder list, or null when there is nothing to judge. */
export function holderCheck(h: TideHolders | null): XRayCheck | null {
  if (!h || h.topOnePct === null) return null;
  const one = h.topOnePct;
  const ten = h.topTenPct;
  const level = (one > 25 || (ten !== null && ten > 70)) ? "risk" : (one > 12 || (ten !== null && ten > 50)) ? "watch" : "ok";
  const detail =
    `The biggest holder owns ${pct1(one)} of supply` +
    (ten !== null ? ` and the top ten own ${pct1(ten)}` : "") +
    (h.excluded > 0 ? `, leaving out ${h.excluded} pool or contract address${h.excluded === 1 ? "" : "es"}` : "") +
    ". Source: Tide.";
  return { id: "holders", label: "Holder concentration", level, detail };
}

/* ---------------- All-coins wallet profit (wallet.pnl) ---------------- */

export type WalletPnlRow = {
  coin: string | null;
  realisedUsd: number | null;
  unrealisedUsd: number | null;
  totalUsd: number | null;
};

export type WalletPnlPage = {
  rows: WalletPnlRow[];
  /** A string means more pages. null means the last page. undefined means the response named no cursor at all. */
  next: string | null | undefined;
};

const CURSOR_KEYS = ["nextCursor", "next_cursor", "cursor", "next"];

function findCursor(doc: unknown): string | null | undefined {
  if (!isObj(doc)) return undefined;
  const places: Obj[] = [doc];
  for (const k of ["page", "paging", "pagination", "meta"]) if (isObj(doc[k])) places.push(doc[k] as Obj);
  for (const place of places) {
    for (const key of CURSOR_KEYS) {
      if (!(key in place)) continue;
      const v = place[key];
      if (v === null || v === "" || v === false) return null;
      if (typeof v === "string") return v;
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
    }
  }
  return undefined;
}

/** One page of per-coin results for a wallet. Null when the body has no list of coin rows. */
export function parseWalletPnl(doc: unknown): WalletPnlPage | null {
  let rows: unknown;
  if (Array.isArray(doc)) rows = doc;
  else {
    const o = unwrap(doc);
    if (!o) return null;
    rows = first(o, ["rows", "items", "coins", "pnl", "results", "data"]);
    // The list may sit one level down when the body is wrapped in data/result.
    if (!Array.isArray(rows) && isObj(doc)) rows = first(doc, ["rows", "items", "coins", "pnl", "results"]);
  }
  if (!Array.isArray(rows)) return null;

  const out: WalletPnlRow[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const coinRaw = first(r, ["coin", "coinType", "type"]);
    const coin = typeof coinRaw === "string" ? coinRaw : isObj(coinRaw) ? str(first(coinRaw, ["type", "coinType", "address", "id"])) : null;
    out.push({
      coin,
      realisedUsd: num(first(r, ["realizedUsd", "realized", "realisedUsd"])),
      unrealisedUsd: num(first(r, ["unrealizedUsd", "unrealized"])),
      totalUsd: num(first(r, ["totalUsd", "pnlUsd", "total"])),
    });
  }
  // A non-empty list in which no row has any recognisable figure is a different shape, not an empty wallet.
  if (rows.length > 0 && out.every((r) => r.realisedUsd === null && r.unrealisedUsd === null && r.totalUsd === null)) return null;

  // null means "last page", so only fall through to the inner body when nothing was named at the top.
  let next = findCursor(doc);
  if (next === undefined && isObj(doc) && isObj(doc.data)) next = findCursor(doc.data);
  return { rows: out, next };
}

export type WalletLifetime = {
  /** Sum of realised profit across coins. */
  realisedUsd: number;
  wins: number;
  /** Coins with a non-zero realised result, meaning the wallet actually sold some. */
  closed: number;
  traded: number;
  /** Coins whose realised figure Tide could not work out. */
  unknown: number;
  /** False when pages were left unread or the response gave no sign of whether more existed. */
  complete: boolean;
};

export function summariseWalletPnl(rows: WalletPnlRow[], complete: boolean): WalletLifetime {
  const seen = new Set<string>();
  let realisedUsd = 0;
  let wins = 0;
  let closed = 0;
  let traded = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.coin) {
      if (seen.has(r.coin)) continue;
      seen.add(r.coin);
    }
    traded += 1;
    if (r.realisedUsd === null) {
      unknown += 1;
      continue;
    }
    realisedUsd += r.realisedUsd;
    if (r.realisedUsd !== 0) closed += 1;
    if (r.realisedUsd > 0) wins += 1;
  }
  return { realisedUsd, wins, closed, traded, unknown, complete: complete && unknown === 0 };
}
