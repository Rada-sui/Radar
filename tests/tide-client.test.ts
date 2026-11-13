import assert from "node:assert/strict";
import { before, beforeEach, describe, it } from "node:test";

// Set before the client module is loaded: it reads its settings once at import.
process.env.TIDE_API_KEY = "test-key";
process.env.TIDE_BASE = "https://tide.test";

let enrichWithTide: typeof import("@/lib/server/tide").enrichWithTide;
let tideEnabled: typeof import("@/lib/server/tide").tideEnabled;
let __resetTideMeter: typeof import("@/lib/server/tide").__resetTideMeter;
let __resetStore: typeof import("@/lib/server/cache").__resetStore;

before(async () => {
  ({ enrichWithTide, tideEnabled, __resetTideMeter } = await import("@/lib/server/tide"));
  ({ __resetStore } = await import("@/lib/server/cache"));
});

const COIN = "0x1234::meme::MEME";
type Call = { url: string; key: string | null };
let calls: Call[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(handler: (url: string) => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, key: headers.get("x-api-key") });
    return handler(url);
  }) as typeof fetch;
}

const holdersBody = { holders: [{ rank: 1, owner: "0xaa", pctSupply: 4, kind: "wallet" }] };
const pnlBody = { realizedUsd: 12.5, unrealizedUsd: 0, pnlUsd: 12.5, status: "exited", complete: true };

beforeEach(() => {
  process.env.TIDE_DAILY_CREDITS = "100000";
  calls = [];
  __resetStore();
  __resetTideMeter();
});

describe("Tide client", () => {
  it("is on when a key is set", () => assert.equal(tideEnabled(), true));

  it("sends the key, calls the documented paths and fills the results", async () => {
    mockFetch((url) => (url.includes("/holders") ? json(holdersBody) : json(pnlBody)));
    const r = await enrichWithTide(COIN, ["0xaa", "0xbb"]);
    assert.equal(r.status, "ok");
    assert.equal(r.walletsChecked, 2);
    assert.equal(r.holders?.holders.length, 1);
    assert.equal(r.lifetime.get("0xaa")?.realisedUsd, 12.5);
    assert.ok(calls.every((c) => c.key === "test-key"));
    assert.ok(calls.some((c) => c.url === `https://tide.test/v1/coins/${encodeURIComponent(COIN)}/holders?limit=20`));
    assert.ok(calls.some((c) => c.url === `https://tide.test/v1/wallet/0xaa/pnl/${COIN}`));
  });

  it("looks up at most ten wallets", async () => {
    mockFetch((url) => (url.includes("/holders") ? json(holdersBody) : json(pnlBody)));
    const wallets = Array.from({ length: 25 }, (_, i) => `0x${i.toString(16).padStart(2, "0")}`);
    const r = await enrichWithTide(COIN, wallets);
    assert.equal(r.walletsChecked, 10);
    assert.equal(calls.filter((c) => c.url.includes("/pnl/")).length, 10);
  });

  it("reports partial when some calls fail", async () => {
    mockFetch((url) => (url.includes("/holders") ? json({ error: "x" }, 500) : json(pnlBody)));
    const r = await enrichWithTide(COIN, ["0xaa"]);
    assert.equal(r.status, "partial");
    assert.equal(r.holders, null);
    assert.equal(r.lifetime.size, 1);
  });

  it("reports unavailable, and does not throw, when Tide is down", async () => {
    mockFetch(() => json({ error: "down" }, 503));
    const r = await enrichWithTide(COIN, ["0xaa", "0xbb"]);
    assert.equal(r.status, "unavailable");
    assert.equal(r.lifetime.size, 0);
  });

  it("treats a response it cannot read as no answer", async () => {
    mockFetch(() => json({ surprise: true }));
    const r = await enrichWithTide(COIN, ["0xaa"]);
    assert.equal(r.status, "unavailable");
  });

  it("treats a network error as no answer", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const r = await enrichWithTide(COIN, ["0xaa"]);
    assert.equal(r.status, "unavailable");
  });

  it("reads every page of a wallet and says it is complete", async () => {
    const pages = [
      { rows: [{ coin: "a", realizedUsd: 10 }, { coin: "b", realizedUsd: -2 }], nextCursor: "p2" },
      { rows: [{ coin: "c", realizedUsd: 5 }], nextCursor: null },
    ];
    mockFetch((url) => json(url.includes("cursor=p2") ? pages[1] : pages[0]));
    const { tideWalletLifetime } = await import("@/lib/server/tide");
    const r = await tideWalletLifetime("0xaa");
    assert.equal(r?.realisedUsd, 13);
    assert.equal(r?.wins, 2);
    assert.equal(r?.closed, 3);
    assert.equal(r?.complete, true);
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.includes("sort=realized&dir=desc&cursor=p2"));
  });

  it("marks a wallet incomplete when pages run out of budget or no cursor is named", async () => {
    const { tideWalletLifetime } = await import("@/lib/server/tide");
    mockFetch(() => json({ rows: [{ coin: `c${calls.length}`, realizedUsd: 1 }], nextCursor: `more${calls.length}` }));
    const endless = await tideWalletLifetime("0xaa");
    assert.equal(endless?.complete, false);
    assert.equal(calls.length, 4); // page limit
    __resetStore();
    calls = [];
    mockFetch(() => json({ rows: [{ coin: "a", realizedUsd: 1 }] }));
    const unknown = await tideWalletLifetime("0xbb");
    assert.equal(unknown?.complete, false);
    assert.equal(calls.length, 1);
  });

  it("returns nothing for a wallet whose answer cannot be read", async () => {
    const { tideWalletLifetime } = await import("@/lib/server/tide");
    mockFetch(() => json({ surprise: 1 }));
    assert.equal(await tideWalletLifetime("0xaa"), null);
  });

  it("batches wallets, skips failures and never throws", async () => {
    const { tideWalletBatch } = await import("@/lib/server/tide");
    mockFetch((url) => (url.includes("0xbad") ? json({ error: "x" }, 500) : json({ rows: [{ coin: "a", realizedUsd: 7 }], nextCursor: null })));
    const m = await tideWalletBatch(["0x01", "0xbad", "0x02"]);
    assert.deepEqual([...m.keys()].sort(), ["0x01", "0x02"]);
  });

  it("stops at the daily credit ceiling", async () => {
    // Ceiling is 40: holders (5) + three lookups (30) = 35, so a fourth lookup (10) is refused.
    process.env.TIDE_DAILY_CREDITS = "40";
    mockFetch((url) => (url.includes("/holders") ? json(holdersBody) : json(pnlBody)));
    const r = await enrichWithTide(COIN, ["0x01", "0x02", "0x03", "0x04", "0x05"]);
    assert.equal(calls.length, 4);
    const pnlCalls = calls.filter((c) => c.url.includes("/pnl/")).length;
    assert.equal(pnlCalls, 3);
    assert.equal(r.walletsChecked, 3);
    assert.equal(r.status, "partial");
  });
});
