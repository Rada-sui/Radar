import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOT_TRADE_LIMIT, computePnl, gradeWallets, rankTokenWallets, tierOf, type PnlTrade, type WalletPnl } from "@/lib/server/pnl";
import { showCountOptions } from "@/components/ui";
import { fmtRoi } from "@/lib/format";

const t = (o: Partial<PnlTrade>): PnlTrade => ({
  ts: 0,
  block: 1,
  tx: "t",
  wallet: "0xa",
  side: "buy",
  tokens: 0,
  usd: 0,
  token: "A",
  ...o,
});

describe("computePnl", () => {
  it("uses a running average cost and counts only the sold part", () => {
    // Buy 100 for $10, buy 100 more for $30 (avg $0.20), sell 100 for $50.
    const [w] = computePnl(
      [
        t({ ts: 1, side: "buy", tokens: 100, usd: 10 }),
        t({ ts: 2, side: "buy", tokens: 100, usd: 30 }),
        t({ ts: 3, side: "sell", tokens: 100, usd: 50 }),
      ],
      0,
    );
    assert.equal(w.realised, 30); // 50 - 100 * 0.20
    assert.equal(w.tokensClosed, 1);
    assert.equal(w.wins, 1);
  });

  it("does not let a later buy change profit already realised", () => {
    const [w] = computePnl(
      [
        t({ ts: 1, side: "buy", tokens: 100, usd: 10 }),
        t({ ts: 2, side: "sell", tokens: 100, usd: 20 }),
        t({ ts: 3, side: "buy", tokens: 100, usd: 1000 }),
      ],
      0,
    );
    assert.equal(w.realised, 10);
  });

  it("ignores the unmatched part of a sell and flags it", () => {
    // Sold 200 tokens but only 100 were bought in the window.
    const [w] = computePnl(
      [
        t({ ts: 1, side: "buy", tokens: 100, usd: 10 }),
        t({ ts: 2, side: "sell", tokens: 200, usd: 80 }),
      ],
      0,
    );
    assert.equal(w.soldMatchedUsd, 40); // half the proceeds match the known buy
    assert.equal(w.realised, 30); // 40 - 10
    assert.equal(w.unmatchedTokens, 100);
    assert.ok(w.realised <= w.soldMatchedUsd);
  });

  it("books nothing for a sell with no earlier buy", () => {
    const [w] = computePnl([t({ ts: 1, side: "sell", tokens: 50, usd: 50 })], 0);
    assert.equal(w.realised, 0);
    assert.equal(w.tokensClosed, 0);
    assert.equal(w.unmatchedTokens, 50);
  });

  it("separates wallets and tokens, and counts wins per token", () => {
    const rows = computePnl(
      [
        t({ ts: 1, wallet: "0xa", token: "A", side: "buy", tokens: 10, usd: 10 }),
        t({ ts: 2, wallet: "0xa", token: "A", side: "sell", tokens: 10, usd: 30 }), // +20
        t({ ts: 3, wallet: "0xa", token: "B", side: "buy", tokens: 10, usd: 10 }),
        t({ ts: 4, wallet: "0xa", token: "B", side: "sell", tokens: 10, usd: 4 }), // -6
        t({ ts: 5, wallet: "0xb", token: "A", side: "buy", tokens: 1, usd: 1 }),
      ],
      0,
    );
    const a = rows.find((r) => r.address === "0xa")!;
    const b = rows.find((r) => r.address === "0xb")!;
    assert.equal(a.realised, 14);
    assert.equal(a.tokensClosed, 2);
    assert.equal(a.wins, 1);
    assert.equal(b.tokensClosed, 0);
  });

  it("splits out recent realised profit", () => {
    const [w] = computePnl(
      [
        t({ ts: 1, side: "buy", tokens: 100, usd: 100 }),
        t({ ts: 2, side: "sell", tokens: 50, usd: 100 }), // +50, early
        t({ ts: 10, side: "sell", tokens: 50, usd: 10 }), // -40, recent
      ],
      5,
    );
    assert.equal(w.realised, 10);
    assert.equal(w.recentRealised, -40);
  });
});

const base = (o: Partial<WalletPnl>): WalletPnl => ({
  address: "0xw",
  realised: 5000,
  recentRealised: 0,
  boughtUsd: 10000,
  soldUsd: 15000,
  boughtTokens: 100,
  soldTokens: 100,
  soldMatchedUsd: 15000,
  roiMultiple: 1.5,
  buys: 6,
  sells: 6,
  tokensTraded: 5,
  tokensClosed: 5,
  wins: 4,
  lastTs: 1,
  firstBuyAt: 1,
  lastSellAt: 2,
  unmatchedTokens: 0,
  ...o,
});

describe("gradeWallets", () => {
  it("ranks a strong, well-evidenced wallet as Diamond", () => {
    const { ranked } = gradeWallets([base({ realised: 12000, soldMatchedUsd: 30000 })]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].tier, "Diamond");
    assert.ok(ranked[0].score >= 75);
  });

  it("rule 1: unprofitable wallets are not ranked", () => {
    const g = gradeWallets([base({ realised: -50 }), base({ address: "0xz", realised: 0 })]);
    assert.equal(g.ranked.length, 0);
    assert.equal(g.droppedUnprofitable, 2);
  });

  it("rule 2: drops a wallet that realised more than it sold", () => {
    const g = gradeWallets([base({ realised: 9000, soldMatchedUsd: 4000 })]);
    assert.equal(g.ranked.length, 0);
    assert.equal(g.droppedInconsistent, 1);
  });

  it("rule 2: drops wallets with non-finite figures", () => {
    const g = gradeWallets([base({ realised: Number.NaN }), base({ address: "0xy", soldUsd: Infinity })]);
    assert.equal(g.ranked.length, 0);
    assert.equal(g.droppedInconsistent, 2);
  });

  it("rule 3: a recent loss lowers the score", () => {
    const calm = gradeWallets([base({ recentRealised: 0 })]).ranked[0];
    const hit = gradeWallets([base({ recentRealised: -3000 })]).ranked[0];
    assert.ok(hit.score < calm.score);
  });

  it("rule 3: a recent gain never raises the score", () => {
    const calm = gradeWallets([base({ recentRealised: 0 })]).ranked[0];
    const hot = gradeWallets([base({ recentRealised: 4000 })]).ranked[0];
    assert.equal(hot.score, calm.score);
  });

  it("the recent penalty is capped at 40%", () => {
    const calm = gradeWallets([base({ recentRealised: 0 })]).ranked[0];
    const crushed = gradeWallets([base({ recentRealised: -1_000_000 })]).ranked[0];
    assert.ok(crushed.score >= Math.round(calm.score * 0.6) - 1);
  });

  it("drops likely bots by trade count", () => {
    const g = gradeWallets([base({ buys: BOT_TRADE_LIMIT, sells: 1 })]);
    assert.equal(g.ranked.length, 0);
    assert.equal(g.droppedBots, 1);
  });

  it("one lucky trade cannot reach Diamond", () => {
    const { ranked } = gradeWallets([base({ realised: 50000, soldMatchedUsd: 60000, tokensClosed: 1, wins: 1 })]);
    assert.notEqual(ranked[0].tier, "Diamond");
  });

  it("sorts by score then realised profit", () => {
    const { ranked } = gradeWallets([
      base({ address: "0xlow", realised: 200, soldMatchedUsd: 900, tokensClosed: 2, wins: 1 }),
      base({ address: "0xhigh", realised: 20000, soldMatchedUsd: 50000 }),
    ]);
    assert.deepEqual(ranked.map((r) => r.address), ["0xhigh", "0xlow"]);
  });

  it("flags a wallet that sold tokens bought before the window as partial", () => {
    const { ranked } = gradeWallets([base({ unmatchedTokens: 10 })]);
    assert.equal(ranked[0].partial, true);
  });
});

describe("tierOf", () => {
  it("needs evidence as well as score", () => {
    assert.equal(tierOf(90, 0.9, 2), "Gold");
    assert.equal(tierOf(90, 0.4, 5), "Silver");
    assert.equal(tierOf(60, 0.5, 2), "Gold");
    assert.equal(tierOf(40, 1, 10), "Silver");
  });
});

describe("token wallet ranking and show counts", () => {
  it("does not round small profitable ROIs down to 1.0x", () => {
    assert.equal(fmtRoi(1.04), "1.04x");
    assert.equal(fmtRoi(1.4), "1.4x");
    assert.equal(fmtRoi(6), "6.0x");
  });
  it("keeps only profitable wallets and orders by realised profit", () => {
    const rows = rankTokenWallets([
      { ...base({ address: "0xlow", realised: 2, soldMatchedUsd: 12 }), roiMultiple: 1.2 },
      { ...base({ address: "0xhigh", realised: 50, soldMatchedUsd: 150 }), roiMultiple: 1.5 },
      { ...base({ address: "0xloss", realised: -2 }), roiMultiple: 0.8 },
      { ...base({ address: "0xbot", buys: BOT_TRADE_LIMIT, sells: 1 }), roiMultiple: 2 },
    ]);
    assert.deepEqual(rows.map((row) => row.address), ["0xhigh", "0xlow"]);
  });

  it("only offers show counts the loaded list can fill", () => {
    assert.deepEqual(showCountOptions(4), []);
    assert.deepEqual(showCountOptions(10), [5, 10]);
    assert.deepEqual(showCountOptions(30), [5, 10, 20, 30]);
  });
});
