import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { gradeLifetime } from "@/lib/server/tide-board";
import { holderCheck, num, parseCoinPnl, parseHolders, parseWalletPnl, summariseWalletPnl, timeMs } from "@/lib/server/tide-parse";
import type { LeaderRow } from "@/lib/types";
import { enrichWithTide, tideEnabled } from "@/lib/server/tide";

/*
 * Tide publishes field names but no JSON schema. The documents below are built from those field
 * names, so they prove the parsers behave, not that Tide's real responses look like this.
 * The "real fixtures" block at the bottom runs against saved live responses once you have them:
 *   TIDE_API_KEY=... node tools/tide-probe.mjs <coinType> <walletAddress>
 */

const pnlDoc = {
  bought: { amount: "1000", usd: "50.5", swaps: 4 },
  sold: { amount: "600", usd: 90, swaps: 2 },
  avgBuyUsd: 0.0505,
  avgSellUsd: "0.15",
  realizedUsd: "42.3",
  unrealizedUsd: 10,
  pnlUsd: 52.3,
  roiPct: 103.5,
  status: "holding",
  firstBuy: "2026-10-01T10:00:00Z",
  lastTrade: 1_790_000_000,
  complete: true,
  notes: ["Two transfers in are not counted as buys."],
};

describe("numbers and times", () => {
  it("reads numbers and numeric strings, and rejects the rest", () => {
    assert.equal(num(5), 5);
    assert.equal(num("5.5"), 5.5);
    assert.equal(num(""), null);
    assert.equal(num("abc"), null);
    assert.equal(num(Infinity), null);
    assert.equal(num(null), null);
  });
  it("reads ms, seconds and ISO times", () => {
    assert.equal(timeMs(1_790_000_000_000), 1_790_000_000_000);
    assert.equal(timeMs(1_790_000_000), 1_790_000_000_000);
    assert.equal(timeMs("2026-10-01T10:00:00Z"), Date.parse("2026-10-01T10:00:00Z"));
    assert.equal(timeMs(0), null);
    assert.equal(timeMs("nope"), null);
  });
});

describe("parseCoinPnl", () => {
  it("parses the documented fields", () => {
    const l = parseCoinPnl(pnlDoc)!;
    assert.equal(l.realisedUsd, 42.3);
    assert.equal(l.unrealisedUsd, 10);
    assert.equal(l.pnlUsd, 52.3);
    assert.equal(l.roiPct, 103.5);
    assert.equal(l.boughtUsd, 50.5);
    assert.equal(l.soldUsd, 90);
    assert.equal(l.swaps, 6);
    assert.equal(l.avgSellUsd, 0.15);
    assert.equal(l.status, "holding");
    assert.equal(l.lastTradeAt, 1_790_000_000_000);
    assert.equal(l.complete, true);
    assert.deepEqual(l.notes, ["Two transfers in are not counted as buys."]);
  });
  it("accepts the body wrapped in data or result", () => {
    assert.equal(parseCoinPnl({ data: pnlDoc })!.realisedUsd, 42.3);
    assert.equal(parseCoinPnl({ result: pnlDoc, asOf: "x" })!.realisedUsd, 42.3);
  });
  it("keeps unknown values null instead of guessing", () => {
    const l = parseCoinPnl({ realizedUsd: 5, status: "weird", complete: "yes" })!;
    assert.equal(l.unrealisedUsd, null);
    assert.equal(l.status, null);
    assert.equal(l.complete, null);
    assert.equal(l.swaps, null);
  });
  it("returns null when no profit figure is present", () => {
    assert.equal(parseCoinPnl({ status: "none" }), null);
    assert.equal(parseCoinPnl({ error: "not_indexed" }), null);
    assert.equal(parseCoinPnl(null), null);
    assert.equal(parseCoinPnl([]), null);
    assert.equal(parseCoinPnl("text"), null);
  });
});

const holder = (rank: number, pct: number, extra: Record<string, unknown> = {}) => ({
  rank,
  owner: `0x${rank.toString(16).padStart(2, "0")}`,
  pctSupply: pct,
  amount: "1",
  amountRaw: "1",
  value: { usd: 10 },
  kind: "wallet",
  ...extra,
});

describe("parseHolders", () => {
  it("parses a list, wrapped or bare", () => {
    const rows = [holder(1, 10), holder(2, 5)];
    assert.equal(parseHolders(rows)!.holders.length, 2);
    assert.equal(parseHolders({ holders: rows })!.holders.length, 2);
    assert.equal(parseHolders({ data: { items: rows } })!.holders.length, 2);
  });
  it("leaves pools out of concentration but still lists them", () => {
    const h = parseHolders([holder(1, 40, { kind: "pool" }), holder(2, 8), holder(3, 4)])!;
    assert.equal(h.holders.length, 3);
    assert.equal(h.excluded, 1);
    assert.equal(h.topOnePct, 8);
    assert.equal(h.topTenPct, null); // fewer than ten people
  });
  it("adds up the ten biggest people only when ten exist", () => {
    const rows = Array.from({ length: 12 }, (_, i) => holder(i + 1, 5));
    const h = parseHolders(rows)!;
    assert.equal(h.topTenPct, 50);
  });
  it("reads an owner given as an object with a name", () => {
    const h = parseHolders([{ rank: 1, owner: { address: "0xaa", name: "alice.sui" }, pctSupply: "3.5" }])!;
    assert.equal(h.holders[0].address, "0xaa");
    assert.equal(h.holders[0].label, "alice.sui");
    assert.equal(h.holders[0].pctSupply, 3.5);
  });
  it("rejects shares that cannot be percentages", () => {
    assert.equal(parseHolders([holder(1, 150)]), null);
    assert.equal(parseHolders([holder(1, 70), holder(2, 60)]), null);
    assert.equal(parseHolders([holder(1, -1)]), null);
  });
  it("returns null for unrecognised bodies", () => {
    assert.equal(parseHolders({ error: "not_found" }), null);
    assert.equal(parseHolders([]), null);
    assert.equal(parseHolders(null), null);
    assert.equal(parseHolders({ holders: "x" }), null);
  });
});

describe("holderCheck", () => {
  const h = (one: number, ten: number | null, excluded = 0) => ({ holders: [], topOnePct: one, topTenPct: ten, excluded });
  it("is clear for a spread-out token", () => assert.equal(holderCheck(h(3, 25))!.level, "ok"));
  it("watches a heavy top holder or top ten", () => {
    assert.equal(holderCheck(h(15, 30))!.level, "watch");
    assert.equal(holderCheck(h(5, 55))!.level, "watch");
  });
  it("flags real concentration as a risk", () => {
    assert.equal(holderCheck(h(30, 40))!.level, "risk");
    assert.equal(holderCheck(h(5, 80))!.level, "risk");
  });
  it("says what was left out and names the source", () => {
    const c = holderCheck(h(5, 20, 2))!;
    assert.match(c.detail, /leaving out 2 pool or contract addresses/);
    assert.match(c.detail, /Tide/);
  });
  it("gives nothing without data", () => {
    assert.equal(holderCheck(null), null);
    assert.equal(holderCheck({ holders: [], topOnePct: null, topTenPct: null, excluded: 0 }), null);
  });
});

const walletPage = (rows: object[], extra: object = {}) => ({ rows, ...extra });
const coinRow = (coin: string, realized: number | null) => ({ coin, realizedUsd: realized, unrealizedUsd: 1, totalUsd: (realized ?? 0) + 1 });

describe("parseWalletPnl", () => {
  it("reads rows and a next cursor", () => {
    const p = parseWalletPnl(walletPage([coinRow("a", 10), coinRow("b", -4)], { nextCursor: "abc" }))!;
    assert.equal(p.rows.length, 2);
    assert.equal(p.rows[0].realisedUsd, 10);
    assert.equal(p.next, "abc");
  });
  it("tells the last page from an unknown one", () => {
    assert.equal(parseWalletPnl(walletPage([coinRow("a", 1)], { nextCursor: null }))!.next, null);
    assert.equal(parseWalletPnl(walletPage([coinRow("a", 1)]))!.next, undefined);
    assert.equal(parseWalletPnl({ data: { rows: [coinRow("a", 1)], next_cursor: "n" } })!.next, "n");
    assert.equal(parseWalletPnl({ rows: [coinRow("a", 1)], page: { cursor: "z" } })!.next, "z");
  });
  it("accepts a coin given as an object, a bare array and a wrapped body", () => {
    assert.equal(parseWalletPnl([{ coin: { type: "0x1::a::B" }, realizedUsd: 3 }])!.rows[0].coin, "0x1::a::B");
    assert.equal(parseWalletPnl({ data: { items: [coinRow("a", 2)] } })!.rows.length, 1);
  });
  it("keeps unknown realised figures null", () => {
    assert.equal(parseWalletPnl(walletPage([coinRow("a", null), coinRow("b", 2)]))!.rows[0].realisedUsd, null);
  });
  it("accepts an empty wallet but rejects a different shape", () => {
    assert.equal(parseWalletPnl(walletPage([]))!.rows.length, 0);
    assert.equal(parseWalletPnl(walletPage([{ foo: 1 }, { bar: 2 }])), null);
    assert.equal(parseWalletPnl({ error: "nope" }), null);
    assert.equal(parseWalletPnl(null), null);
    assert.equal(parseWalletPnl("x"), null);
  });
});

describe("summariseWalletPnl", () => {
  const rows = [coinRow("a", 100), coinRow("b", -40), coinRow("c", 0), coinRow("d", 25)].map((r) => ({
    coin: r.coin,
    realisedUsd: r.realizedUsd,
    unrealisedUsd: r.unrealizedUsd,
    totalUsd: r.totalUsd,
  }));
  it("counts wins over coins actually sold, not every coin held", () => {
    const s = summariseWalletPnl(rows, true);
    assert.equal(s.realisedUsd, 85);
    assert.equal(s.wins, 2);
    assert.equal(s.closed, 3); // the 0 row was never sold
    assert.equal(s.traded, 4);
    assert.equal(s.complete, true);
  });
  it("is incomplete when pages were left or a figure is unknown", () => {
    assert.equal(summariseWalletPnl(rows, false).complete, false);
    const withNull = [...rows, { coin: "e", realisedUsd: null, unrealisedUsd: null, totalUsd: null }];
    const s = summariseWalletPnl(withNull, true);
    assert.equal(s.unknown, 1);
    assert.equal(s.complete, false);
  });
  it("does not count the same coin twice", () => {
    const dup = [rows[0], rows[0]];
    assert.equal(summariseWalletPnl(dup, true).traded, 1);
    assert.equal(summariseWalletPnl(dup, true).realisedUsd, 100);
  });
});

const cand = (address: string, over: Partial<LeaderRow> = {}): LeaderRow => ({
  address,
  tier: "Silver",
  score: 50,
  realisedUsd: 200,
  recentRealisedUsd: 0,
  winRate: 1,
  wins: 1,
  soldTokens: 1,
  tokensClosed: 1,
  tokensTraded: 1,
  trades: 4,
  boughtUsd: 300,
  soldUsd: 500,
  lastActiveAt: 1,
  firstBuyAt: 1,
  lastSellAt: 2,
  partial: false,
  ...over,
});
const life = (realisedUsd: number, wins: number, closed: number, complete = true) => ({ realisedUsd, wins, closed, traded: closed, unknown: 0, complete });

describe("gradeLifetime", () => {
  it("ranks on whole-history profit and shows wins over sold coins", () => {
    const g = gradeLifetime([cand("a"), cand("b")], new Map([["a", life(20_000, 50, 73)], ["b", life(900, 1, 1)]]));
    assert.equal(g.rows[0].address, "a");
    assert.equal(g.rows[0].wins, 50);
    assert.equal(g.rows[0].soldTokens, 73);
    assert.equal(g.rows[0].basis, "lifetime");
    assert.equal(g.rows[0].realised24hUsd, 200);
  });
  it("one lucky coin cannot beat a long record", () => {
    const g = gradeLifetime([cand("lucky"), cand("steady")], new Map([["lucky", life(5_000, 1, 1)], ["steady", life(5_000, 50, 73)]]));
    assert.equal(g.rows[0].address, "steady");
  });
  it("drops wallets that are not profitable over their history", () => {
    const g = gradeLifetime([cand("a"), cand("b"), cand("c")], new Map([["a", life(-50, 3, 9)], ["b", life(0, 0, 0)], ["c", life(10, 1, 1)]]));
    assert.deepEqual(g.rows.map((r) => r.address), ["c"]);
    assert.equal(g.dropped, 2);
    assert.equal(g.answered, 3);
  });
  it("skips wallets Tide had no answer for", () => {
    const g = gradeLifetime([cand("a"), cand("b")], new Map([["a", life(100, 2, 2)]]));
    assert.equal(g.answered, 1);
    assert.equal(g.rows.length, 1);
  });
  it("caps a partly read wallet at Silver and flags it partial", () => {
    const g = gradeLifetime([cand("a")], new Map([["a", life(90_000, 60, 70, false)]]));
    assert.equal(g.rows[0].tier, "Silver");
    assert.equal(g.rows[0].partial, true);
    assert.equal(g.incomplete, 1);
  });
  it("a fully read strong wallet can be Diamond", () => {
    const g = gradeLifetime([cand("a")], new Map([["a", life(90_000, 60, 70, true)]]));
    assert.equal(g.rows[0].tier, "Diamond");
  });
  it("rule 3: a recent loss lowers the score and a recent gain does not raise it", () => {
    const base = gradeLifetime([cand("a")], new Map([["a", life(1000, 5, 8)]])).rows[0].score;
    const loss = gradeLifetime([cand("a", { recentRealisedUsd: -500 })], new Map([["a", life(1000, 5, 8)]])).rows[0].score;
    const gain = gradeLifetime([cand("a", { recentRealisedUsd: 900 })], new Map([["a", life(1000, 5, 8)]])).rows[0].score;
    assert.ok(loss < base);
    assert.equal(gain, base);
  });
  it("drops non-finite figures", () => {
    const g = gradeLifetime([cand("a")], new Map([["a", life(Number.NaN, 1, 1)]]));
    assert.equal(g.rows.length, 0);
  });
});

describe("Tide switched off", () => {
  it("does nothing and changes nothing without a key", async () => {
    assert.equal(tideEnabled(), false);
    const r = await enrichWithTide("0x1::a::B", ["0xaa"]);
    assert.equal(r.status, "off");
    assert.equal(r.holders, null);
    assert.equal(r.lifetime.size, 0);
  });
});

describe("real fixtures (run the probe to add them)", () => {
  const dir = new URL("./fixtures/tide/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  it("has none yet, which is fine", { skip: files.length > 0 }, () => {});
  for (const f of files) {
    it(`parses ${f}`, () => {
      const doc = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
      if (f.startsWith("holders")) {
        const h = parseHolders(doc);
        assert.ok(h, "holders fixture did not parse; send it to be fixed");
        assert.ok(h.holders.length > 0);
      } else if (f.startsWith("coin-pnl")) {
        const l = parseCoinPnl(doc);
        assert.ok(l, "coin-pnl fixture did not parse; send it to be fixed");
      } else if (f.startsWith("wallet-pnl")) {
        const p = parseWalletPnl(doc);
        assert.ok(p, "wallet-pnl fixture did not parse; send it to be fixed");
        assert.ok(p.next !== undefined, "wallet-pnl fixture names no cursor field; boards will be marked partial");
      }
    });
  }
});
