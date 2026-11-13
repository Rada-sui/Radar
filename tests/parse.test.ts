import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { parsePair } from "@/lib/server/dexscreener";
import { num, parsePool, parseTokenInfo, type GeckoResource } from "@/lib/server/parse";
import { parseTrades } from "@/lib/server/analysis";
import { isCoinType, isSuiAddress, normalizeCoin, sameCoin } from "@/lib/sui";

// Fixtures follow the documented GeckoTerminal response shape.
const tokenRes = (id: string, symbol: string): GeckoResource => ({
  id: `sui-network_${id}`,
  type: "token",
  attributes: { address: id, name: `${symbol} coin`, symbol, image_url: "https://img.example/x.png" },
});

const pool = (o: Record<string, unknown> = {}): GeckoResource => ({
  id: "sui-network_0xpool",
  type: "pool",
  attributes: {
    address: "0xpool",
    name: "MEME / SUI 0.3%",
    base_token_price_usd: "0.0123",
    fdv_usd: "123000",
    market_cap_usd: null,
    reserve_in_usd: "45000.5",
    pool_created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    price_change_percentage: { h1: "12.5", h24: "-3" },
    volume_usd: { h1: "9000", h24: "80000" },
    transactions: { h1: { buys: 120, sells: 80 } },
    ...o,
  },
  relationships: {
    base_token: { data: { id: "sui-network_0xabc::meme::MEME", type: "token" } },
    dex: { data: { id: "sui-network_cetus", type: "dex" } },
  },
});

const included = (...r: GeckoResource[]) => new Map(r.map((x) => [`${x.type}:${x.id}`, x]));

describe("parsePool", () => {
  it("normalises a Gecko pool into a RadarToken", () => {
    const base = tokenRes("0xabc::meme::MEME", "MEME");
    base.id = "sui-network_0xabc::meme::MEME";
    const t = parsePool(pool(), included(base));
    assert.ok(t);
    assert.equal(t.address, "0xabc::meme::MEME");
    assert.equal(t.symbol, "MEME");
    assert.equal(t.priceUsd, 0.0123);
    assert.equal(t.marketCap, 123000); // falls back to FDV when market cap is null
    assert.equal(t.changeH1, 12.5);
    assert.equal(t.volumeH1, 9000);
    assert.equal(t.liquidityUsd, 45000.5);
    assert.equal(t.buysH1, 120);
    assert.equal(t.sellsH1, 80);
    assert.equal(t.dex, "cetus");
    assert.equal(t.pairAddress, "0xpool");
    assert.ok(t.ageMinutes !== null && t.ageMinutes > 29 && t.ageMinutes < 31);
    assert.equal(t.imageUrl, "https://img.example/x.png");
  });

  it("works without included token data by reading the name and id", () => {
    const t = parsePool(pool(), included());
    assert.ok(t);
    assert.equal(t.symbol, "MEME");
    assert.equal(t.address, "0xabc::meme::MEME");
  });

  it("skips SUI and stablecoin bases", () => {
    const sui = tokenRes("0x2::sui::SUI", "SUI");
    sui.id = "sui-network_0xabc::meme::MEME"; // matches the pool's base ref
    assert.equal(parsePool(pool(), included(sui)), null);
  });

  it("returns null for a pool with no base token", () => {
    const p = pool();
    p.relationships = {};
    assert.equal(parsePool(p, included()), null);
  });

  it("keeps missing numbers as null instead of inventing zeros", () => {
    const t = parsePool(
      pool({ price_change_percentage: {}, volume_usd: {}, base_token_price_usd: null, fdv_usd: null }),
      included(),
    );
    assert.ok(t);
    assert.equal(t.changeH1, null);
    assert.equal(t.volumeH1, null);
    assert.equal(t.priceUsd, null);
    assert.equal(t.marketCap, null);
  });
});

describe("num", () => {
  it("parses numeric strings and rejects junk", () => {
    assert.equal(num("1.5"), 1.5);
    assert.equal(num(2), 2);
    assert.equal(num(null), null);
    assert.equal(num(""), null);
    assert.equal(num("abc"), null);
    assert.equal(num(undefined), null);
  });
});

describe("parsePair (DexScreener)", () => {
  it("reads the documented pair fields", () => {
    const p = parsePair({
      chainId: "sui",
      dexId: "cetus",
      url: "https://dexscreener.com/sui/0xpool",
      pairAddress: "0xpool",
      baseToken: { address: "0xabc::meme::MEME", name: "Meme", symbol: "MEME" },
      quoteToken: { symbol: "SUI" },
      priceUsd: "0.5",
      liquidity: { usd: 1000 },
      volume: { h24: 2000 },
      priceChange: { h24: 4 },
      marketCap: 5000,
      fdv: 6000,
      pairCreatedAt: 1_700_000_000_000,
      info: { imageUrl: "https://img/x.png", websites: [{ url: "https://m.xyz" }], socials: [] },
    });
    assert.ok(p);
    assert.equal(p.priceUsd, 0.5);
    assert.equal(p.liquidityUsd, 1000);
    assert.equal(p.hasProfile, true);
  });

  it("reports no profile when info is absent", () => {
    const p = parsePair({
      chainId: "sui",
      pairAddress: "0xp",
      baseToken: { address: "0xabc::meme::MEME", symbol: "M" },
    });
    assert.ok(p);
    assert.equal(p.hasProfile, false);
  });

  it("ignores pairs from other chains", () => {
    assert.equal(
      parsePair({ chainId: "solana", pairAddress: "x", baseToken: { address: "y", symbol: "Z" } }),
      null,
    );
  });
});

describe("Sui address helpers", () => {
  it("recognises coin types", () => {
    assert.ok(isCoinType("0x2::sui::SUI"));
    assert.ok(isCoinType("0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"));
    assert.ok(!isCoinType("0x2"));
    assert.ok(!isCoinType("hello"));
    assert.ok(!isCoinType("0x2::sui"));
    assert.ok(!isCoinType("0x2::sui::SUI; drop table"));
  });
  it("recognises bare addresses separately", () => {
    assert.ok(isSuiAddress("0xabc123"));
    assert.ok(!isSuiAddress("0x2::sui::SUI"));
  });
  it("compares coins ignoring case and leading zeros", () => {
    assert.ok(sameCoin("0x0002::sui::SUI", "0x2::sui::SUI"));
    assert.ok(sameCoin("0xABC::m::T", "0xabc::m::T"));
    assert.ok(!sameCoin("0xabc::m::T", "0xabd::m::T"));
    assert.equal(normalizeCoin("0x0000a::m::T"), "0xa::m::T");
  });
});

describe("live API fixtures", () => {
  const dir = path.join(process.cwd(), "tests", "fixtures", "live");
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as Record<string, unknown>;
  const coin = fs.readFileSync(path.join(dir, "selected-token.txt"), "utf8");

  it("parses live Gecko pools, including unknown creation timestamps", () => {
    const doc = read("trending-pools.json") as unknown as { data: GeckoResource[]; included: GeckoResource[] };
    const included = new Map(doc.included.map((r) => [`${r.type}:${r.id}`, r]));
    const pool = doc.data.find((p) => p.attributes?.pool_created_at === "1970-01-01T00:00:00Z");
    assert.ok(pool);
    const token = parsePool(pool, included);
    assert.ok(token);
    assert.equal(token.address, coin);
    assert.equal(token.symbol, "DEEP");
    assert.equal(token.ageMinutes, null);
    assert.equal(token.volumeH1, 13707.1663537811);
    assert.equal(token.buysH1, 498);
  });

  it("parses live Gecko token info and trades", () => {
    const info = parseTokenInfo(read("token-info.json") as unknown as { data?: GeckoResource }, coin);
    assert.ok(info);
    assert.equal(info.address, coin);
    assert.equal(info.symbol, "DEEP");
    assert.equal(info.priceUsd, 0.01382389812);
    assert.equal(info.topPools.length, 3);

    const tradeDoc = read("pool-trades.json") as unknown as { data: { attributes: Record<string, unknown> }[] };
    const trades = parseTrades(tradeDoc.data.map((x) => x.attributes), coin);
    assert.ok(trades.length > 0);
    // parseTrades returns oldest first, so find the saved trade by its transaction id.
    const buy = trades.find((t) => t.tx === "CgYtisp2BDkpk3KcvtP2Z6rhiS3bbLsThTWHt9Y9scN1");
    assert.ok(buy);
    assert.equal(buy.side, "buy");
    assert.equal(buy.tokens, 509.308533);
    assert.equal(buy.usd, 7.04338658604747);
  });

  it("parses live DexScreener pairs with numeric fields and profile links", () => {
    const pairs = read("dexscreener-token-pairs.json") as unknown as Record<string, unknown>[];
    const pair = parsePair(pairs[0] as never);
    assert.ok(pair);
    assert.equal(pair.baseAddress, coin);
    assert.equal(pair.priceUsd, 0.01382);
    assert.equal(pair.liquidityUsd, 163543.79);
    assert.equal(pair.changeH24, 0.3);
    assert.equal(pair.createdAt, 1728900213000);
    assert.equal(pair.hasProfile, true);
  });
});
