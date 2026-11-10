import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateWallets,
  computeChecks,
  coverageOf,
  momentumOf,
  parseTrades,
  summarise,
  type Trade,
} from "@/lib/server/analysis";
import type { RadarToken } from "@/lib/types";

const COIN = "0xabc123::meme::MEME";
const SUI = "0x2::sui::SUI";

const raw = (o: Record<string, unknown>) => ({
  tx_hash: "tx",
  block_number: 1,
  block_timestamp: "2026-11-09T10:00:00Z",
  tx_from_address: "0xw1",
  volume_in_usd: "10",
  ...o,
});

describe("parseTrades", () => {
  it("decides side from token addresses, not only from kind", () => {
    const t = parseTrades(
      [
        raw({ to_token_address: COIN, from_token_address: SUI, to_token_amount: "100", from_token_amount: "5" }),
        raw({
          tx_from_address: "0xw2",
          to_token_address: SUI,
          from_token_address: COIN,
          from_token_amount: "40",
          to_token_amount: "2",
          // kind disagrees on purpose: addresses win
          kind: "buy",
        }),
      ],
      COIN,
    );
    assert.deepEqual(t.map((x) => x.side), ["buy", "sell"]);
    assert.equal(t[0].tokens, 100);
    assert.equal(t[1].tokens, 40);
  });

  it("treats a 0x00… padded package id as the same coin", () => {
    const t = parseTrades(
      [raw({ to_token_address: "0x0000abc123::meme::MEME", to_token_amount: "7" })],
      COIN,
    );
    assert.equal(t.length, 1);
    assert.equal(t[0].side, "buy");
  });

  it("drops anomalous, malformed and zero-amount trades", () => {
    const t = parseTrades(
      [
        raw({ is_anomalous: true, kind: "buy", to_token_amount: "5" }),
        raw({ tx_from_address: "", kind: "buy", to_token_amount: "5" }),
        raw({ block_timestamp: "nope", kind: "buy", to_token_amount: "5" }),
        raw({ volume_in_usd: "abc", kind: "buy", to_token_amount: "5" }),
        raw({ kind: "buy", to_token_amount: "0" }),
        raw({ kind: "buy", to_token_amount: "5" }),
      ],
      COIN,
    );
    assert.equal(t.length, 1);
  });

  it("sorts oldest first", () => {
    const t = parseTrades(
      [
        raw({ block_timestamp: "2026-11-09T10:05:00Z", kind: "buy", to_token_amount: "1" }),
        raw({ block_timestamp: "2026-11-09T10:01:00Z", kind: "buy", to_token_amount: "1" }),
      ],
      COIN,
    );
    assert.ok(t[0].ts < t[1].ts);
  });
});

const trade = (o: Partial<Trade>): Trade => ({
  ts: 0,
  block: 1,
  tx: "t",
  wallet: "0xa",
  side: "buy",
  tokens: 0,
  usd: 0,
  ...o,
});

describe("aggregateWallets", () => {
  it("counts realised profit only on the part that was sold", () => {
    // Buys 100 tokens for $10 (avg $0.10), sells 50 for $15.
    const rows = aggregateWallets(
      [
        trade({ ts: 1, side: "buy", tokens: 100, usd: 10 }),
        trade({ ts: 2, side: "sell", tokens: 50, usd: 15 }),
      ],
      0.2,
    );
    assert.equal(rows.length, 1);
    const w = rows[0];
    assert.equal(w.realisedUsd, 10); // 15 sold - 50 * 0.10 cost
    assert.equal(w.heldShare, 0.5);
    assert.equal(w.status, "sold some");
    assert.equal(w.unrealisedUsd, 5); // 50 * 0.2 - 50 * 0.1
    assert.equal(w.soldBeforeWindow, false);
  });

  it("never lets realised profit exceed what was sold, even when more was sold than bought", () => {
    // Bought 10 tokens for $1, sold 30 for $9: 20 of them came from before the window.
    const [w] = aggregateWallets(
      [
        trade({ ts: 1, side: "buy", tokens: 10, usd: 1 }),
        trade({ ts: 2, side: "sell", tokens: 30, usd: 9 }),
      ],
      null,
    );
    assert.equal(w.soldBeforeWindow, true);
    assert.equal(w.realisedUsd, 2); // matched 10 tokens: 3 sold - 1 cost
    assert.ok(w.realisedUsd <= w.soldUsd);
    assert.equal(w.status, "sold all");
    assert.equal(w.unrealisedUsd, null);
  });

  it("does not list a wallet whose first move in the window is a sell", () => {
    const rows = aggregateWallets([trade({ ts: 1, wallet: "0xold", side: "sell", tokens: 5, usd: 5 })], 1);
    assert.equal(rows.length, 0);
  });

  it("orders wallets by when they first bought", () => {
    const rows = aggregateWallets(
      [
        trade({ ts: 5, wallet: "0xlate", tokens: 1, usd: 1 }),
        trade({ ts: 2, wallet: "0xearly", tokens: 1, usd: 1 }),
      ].sort((a, b) => a.ts - b.ts),
      1,
    );
    assert.deepEqual(rows.map((r) => r.address), ["0xearly", "0xlate"]);
  });

  it("marks an untouched position as holding", () => {
    const [w] = aggregateWallets([trade({ ts: 1, tokens: 10, usd: 1 })], 1);
    assert.equal(w.status, "holding");
    assert.equal(w.realisedUsd, 0);
  });
});

describe("summarise", () => {
  it("measures concentration and early holders", () => {
    const trades: Trade[] = [];
    // 12 wallets; wallet 0 buys much more than the rest.
    for (let i = 0; i < 12; i++) {
      trades.push(trade({ ts: i + 1, wallet: `0x${i}`, tokens: 10, usd: i === 0 ? 100 : 10 }));
    }
    // The first wallet sells everything.
    trades.push(trade({ ts: 99, wallet: "0x0", side: "sell", tokens: 10, usd: 90 }));
    const wallets = aggregateWallets(trades, 1);
    const s = summarise(trades, wallets);
    assert.equal(s.uniqueBuyers, 12);
    assert.equal(s.uniqueSellers, 1);
    assert.equal(s.buyUsd, 210);
    assert.ok(Math.abs((s.topBuyerShare ?? 0) - 100 / 210) < 1e-9);
    assert.equal(s.earlyCount, 12);
    assert.equal(s.earlyHolding, 11);
  });
});

describe("coverageOf", () => {
  const some = (n: number): Trade[] => Array.from({ length: n }, (_, i) => trade({ ts: i * 1000 }));

  it("claims complete coverage only for a young pool with room to spare", () => {
    assert.equal(coverageOf(some(40), 120).kind, "complete");
  });
  it("is partial once the feed hits its 300 trade cap", () => {
    assert.equal(coverageOf(some(300), 120).kind, "partial");
  });
  it("is partial for a pool older than a day", () => {
    assert.equal(coverageOf(some(40), 60 * 48).kind, "partial");
  });
  it("is partial when the pool age is unknown", () => {
    assert.equal(coverageOf(some(40), null).kind, "partial");
  });
  it("reports none when there are no trades", () => {
    assert.equal(coverageOf([], 10).kind, "none");
  });
});

describe("computeChecks", () => {
  it("flags heavy top-ten concentration as a risk", () => {
    const trades: Trade[] = [];
    for (let i = 0; i < 12; i++) {
      trades.push(trade({ ts: i + 1, wallet: `0x${i}`, tokens: 1, usd: i < 10 ? 100 : 1 }));
    }
    const wallets = aggregateWallets(trades, 1);
    const summary = summarise(trades, wallets);
    const checks = computeChecks({
      summary,
      coverage: coverageOf(trades, 100),
      liquidityUsd: 5_000,
      marketCap: 1_000_000,
      ageMinutes: 30,
      hasProfile: false,
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    assert.equal(byId["top-ten"].level, "risk");
    assert.equal(byId["liquidity"].level, "risk");
    assert.equal(byId["age"].level, "watch");
    assert.equal(byId["profile"].level, "watch");
  });

  it("says so when there are too few buyers to judge", () => {
    const trades = [trade({ ts: 1, wallet: "0xa", tokens: 1, usd: 5 })];
    const summary = summarise(trades, aggregateWallets(trades, 1));
    const checks = computeChecks({
      summary,
      coverage: coverageOf(trades, 100),
      liquidityUsd: null,
      marketCap: null,
      ageMinutes: null,
      hasProfile: null,
    });
    assert.equal(checks.length, 1);
    assert.equal(checks[0].id, "few-buyers");
  });
});

describe("momentumOf", () => {
  const tok = (o: Partial<RadarToken>): RadarToken => ({
    address: "a",
    symbol: "A",
    name: "A",
    priceUsd: 1,
    marketCap: 1,
    volumeH1: 1,
    volumeH24: 1,
    changeH1: 0,
    changeH24: 0,
    liquidityUsd: 1,
    ageMinutes: 1,
    pairAddress: "p",
    dex: null,
    imageUrl: null,
    url: null,
    ...o,
  });

  it("scores a rising, buy-heavy market as Very good", () => {
    const m = momentumOf([
      tok({ changeH1: 10, buysH1: 90, sellsH1: 10 }),
      tok({ changeH1: 5, buysH1: 80, sellsH1: 20 }),
    ]);
    assert.ok(m);
    assert.equal(m.label, "Very good");
    assert.ok(m.score >= 65);
  });

  it("scores a falling, sell-heavy market as Low", () => {
    const m = momentumOf([
      tok({ changeH1: -10, buysH1: 10, sellsH1: 90 }),
      tok({ changeH1: -5, buysH1: 20, sellsH1: 80 }),
    ]);
    assert.ok(m);
    assert.equal(m.label, "Low");
  });

  it("returns null when there is nothing to measure", () => {
    assert.equal(momentumOf([]), null);
    assert.equal(momentumOf([tok({ changeH1: null })]), null);
  });
});
