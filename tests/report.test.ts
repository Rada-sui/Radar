import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReport } from "@/lib/server/report";
import { scanCounts } from "@/lib/server/leaderboard";
import type { RadarToken } from "@/lib/types";

const tok = (o: Partial<RadarToken>): RadarToken => ({
  address: "a",
  symbol: "A",
  name: "A",
  priceUsd: 1,
  marketCap: 1,
  volumeH1: 1,
  volumeH24: 100,
  changeH1: 0,
  changeH24: 0,
  liquidityUsd: 10_000,
  ageMinutes: 100,
  pairAddress: "p",
  dex: "cetus",
  imageUrl: null,
  url: null,
  ...o,
});

describe("buildReport", () => {
  it("de-duplicates tokens that appear in several lists", () => {
    const r = buildReport([[tok({ address: "x" })], [tok({ address: "x" }), tok({ address: "y" })]]);
    assert.equal(r.totals.pools, 2);
  });

  it("ranks runners by 24h change and skips thin pools", () => {
    const r = buildReport([
      [
        tok({ address: "a", changeH24: 50 }),
        tok({ address: "b", changeH24: 900, liquidityUsd: 100 }), // too thin
        tok({ address: "c", changeH24: 120 }),
        tok({ address: "d", changeH24: null }),
      ],
    ]);
    assert.deepEqual(r.runners.map((t) => t.address), ["c", "a"]);
  });

  it("totals volume by exchange, largest first", () => {
    const r = buildReport([
      [
        tok({ address: "a", dex: "cetus", volumeH24: 300 }),
        tok({ address: "b", dex: "turbos", volumeH24: 500 }),
        tok({ address: "c", dex: "cetus", volumeH24: 400 }),
      ],
    ]);
    assert.deepEqual(r.dexes.map((d) => [d.dex, d.volumeH24, d.pools]), [
      ["cetus", 700, 2],
      ["turbos", 500, 1],
    ]);
    assert.equal(r.totals.volumeH24, 1200);
  });

  it("lists the newest pools first", () => {
    const r = buildReport([
      [tok({ address: "old", ageMinutes: 500 }), tok({ address: "new", ageMinutes: 3 })],
    ]);
    assert.equal(r.newest[0].address, "new");
  });

  it("handles empty input", () => {
    const r = buildReport([[]]);
    assert.equal(r.totals.pools, 0);
    assert.deepEqual(r.runners, []);
  });
});

describe("leaderboard pool counts", () => {
  it("accounts for read, skipped, and failed pools without inflating the scan", () => {
    assert.deepEqual(scanCounts(21, 12, 2), {
      pools: 10,
      poolsTotal: 21,
      poolsSkipped: 9,
      poolsFailed: 2,
    });
  });
});
