// Mock of the GeckoTerminal + DexScreener shapes, for end-to-end testing only.
import http from "node:http";

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString();

const COIN = "0xabc123::meme::MEME";
const COIN2 = "0xdef456::cat::CAT";

const tokens = [
  { addr: COIN, sym: "MEME", name: "Meme Coin", h1: 18.4, vol: 91000, mcap: 410000, liq: 38000, age: 95, buys: 210, sells: 120 },
  { addr: COIN2, sym: "CAT", name: "Cat Token", h1: -6.2, vol: 22000, mcap: 120000, liq: 9000, age: 400, buys: 60, sells: 90 },
  { addr: "0x777::dog::DOG", sym: "DOG", name: "Dog Token", h1: 42.1, vol: 150000, mcap: 880000, liq: 61000, age: 25, buys: 400, sells: 150 },
  { addr: "0x2::sui::SUI", sym: "SUI", name: "Sui", h1: 1, vol: 9e6, mcap: 9e9, liq: 9e7, age: 99999, buys: 1, sells: 1 },
];

const pool = (t, i) => ({
  id: `sui-network_0xpool${i}`,
  type: "pool",
  attributes: {
    address: `0xpool${i}`,
    name: `${t.sym} / SUI 0.3%`,
    base_token_price_usd: String(t.mcap / 1e9),
    fdv_usd: String(t.mcap),
    market_cap_usd: i === 1 ? null : String(t.mcap),
    reserve_in_usd: String(t.liq),
    pool_created_at: iso(t.age),
    price_change_percentage: { h1: String(t.h1), h24: "5" },
    volume_usd: { h1: String(t.vol), h24: String(t.vol * 8) },
    transactions: { h1: { buys: t.buys, sells: t.sells } },
  },
  relationships: {
    base_token: { data: { id: `sui-network_${t.addr}`, type: "token" } },
    dex: { data: { id: "sui-network_cetus", type: "dex" } },
  },
});

const included = tokens.flatMap((t) => [
  { id: `sui-network_${t.addr}`, type: "token", attributes: { address: t.addr, name: t.name, symbol: t.sym } },
  { id: "sui-network_cetus", type: "dex", attributes: { name: "Cetus" } },
]);

const poolsDoc = { data: tokens.map(pool), included };

// 80 trades on MEME: wallets 0..29 buy early (wallet 0 is big), some sell.
const trades = [];
for (let i = 0; i < 40; i++) {
  const w = `0xwallet${String(i % 30).padStart(2, "0")}${"a".repeat(50)}`;
  trades.push({
    block_number: 1000 + i,
    block_timestamp: iso(90 - i),
    tx_hash: `0xtx${i}`,
    tx_from_address: w,
    from_token_address: "0x2::sui::SUI",
    to_token_address: COIN,
    from_token_amount: "100",
    to_token_amount: String(i === 0 ? 900000 : 90000),
    volume_in_usd: i === 0 ? "900" : "90",
    kind: "buy",
  });
}
for (let i = 0; i < 20; i++) {
  const w = `0xwallet${String(i % 30).padStart(2, "0")}${"a".repeat(50)}`;
  trades.push({
    block_number: 2000 + i,
    block_timestamp: iso(40 - i),
    tx_hash: `0xsell${i}`,
    tx_from_address: w,
    from_token_address: COIN,
    to_token_address: "0x2::sui::SUI",
    from_token_amount: String(i % 3 === 0 ? 90000 : 40000),
    to_token_amount: "50",
    volume_in_usd: i % 3 === 0 ? "170" : "75",
    kind: "sell",
  });
}
// Gecko returns newest first
trades.sort((a, b) => Date.parse(b.block_timestamp) - Date.parse(a.block_timestamp));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const p = u.pathname;
  const send = (code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  console.log(new Date().toISOString().slice(11, 19), req.method, p + u.search);

  if (p.endsWith("/trending_pools") || p.endsWith("/new_pools") || p.endsWith("/networks/sui-network/pools")) {
    return send(200, poolsDoc);
  }
  const mTok = p.match(/\/networks\/sui-network\/tokens\/(.+)$/);
  if (mTok) {
    const addr = decodeURIComponent(mTok[1]);
    const t = tokens.find((x) => x.addr === addr);
    if (!t) return send(404, { errors: [{ status: "404" }] });
    return send(200, {
      data: {
        id: `sui-network_${addr}`,
        type: "token",
        attributes: {
          address: addr, name: t.name, symbol: t.sym, image_url: "missing",
          price_usd: String(t.mcap / 1e9), fdv_usd: String(t.mcap), market_cap_usd: String(t.mcap),
          total_reserve_in_usd: String(t.liq), volume_usd: { h24: String(t.vol * 8) },
        },
        relationships: { top_pools: { data: [{ id: "sui-network_0xpool0", type: "pool" }] } },
      },
    });
  }
  if (p.match(/\/pools\/[^/]+\/trades$/)) {
    return send(200, { data: trades.map((a) => ({ id: a.tx_hash, type: "trade", attributes: a })) });
  }
  const mPairs = p.match(/\/token-pairs\/v1\/sui\/(.+)$/);
  if (mPairs) {
    const addr = decodeURIComponent(mPairs[1]);
    const t = tokens.find((x) => x.addr === addr);
    if (!t) return send(200, []);
    return send(200, [
      {
        chainId: "sui", dexId: "cetus", url: "https://dexscreener.com/sui/0xpool0", pairAddress: "0xpool0",
        baseToken: { address: addr, name: t.name, symbol: t.sym }, quoteToken: { symbol: "SUI" },
        priceUsd: String(t.mcap / 1e9), liquidity: { usd: t.liq }, volume: { h24: t.vol * 8 },
        priceChange: { h24: 5 }, marketCap: t.mcap, fdv: t.mcap, pairCreatedAt: now - t.age * 60_000,
        info: addr === COIN ? { websites: [{ url: "https://meme.xyz" }], socials: [] } : null,
      },
    ]);
  }
  send(404, { error: "not mocked", path: p });
});

server.listen(4010, () => console.log("mock on 4010"));
