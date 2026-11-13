// One-off check of Tide's real responses.
//   TIDE_API_KEY=... node tools/tide-probe.mjs <coinType> [walletAddress]
// Saves what Tide returns into tests/fixtures/tide/ so `npm test` can check Radar's parsers
// against the real thing, and prints the field names it sees.
// Get a free key (no email) at https://tide.ad/developers/keys. Costs about 30 credits per run.
import { mkdirSync, writeFileSync } from "node:fs";

const [coin, wallet] = process.argv.slice(2);
const key = process.env.TIDE_API_KEY;
const base = process.env.TIDE_BASE ?? "https://api.tide.ad";
if (!coin || !key) {
  console.error("Usage: TIDE_API_KEY=... node tools/tide-probe.mjs <coinType> [walletAddress]");
  process.exit(1);
}

const out = new URL("../tests/fixtures/tide/", import.meta.url);
mkdirSync(out, { recursive: true });

async function probe(name, path) {
  const res = await fetch(`${base}${path}`, { headers: { "x-api-key": key, accept: "application/json" } });
  const text = await res.text();
  console.log(`\n${name}: HTTP ${res.status}`);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    console.log("  not JSON:", text.slice(0, 200));
    return null;
  }
  const top = Array.isArray(body) ? `array of ${body.length}` : Object.keys(body).join(", ");
  console.log("  top level:", top);
  writeFileSync(new URL(`${name}.json`, out), JSON.stringify(body, null, 2));
  return body;
}

const holders = await probe("holders", `/v1/coins/${encodeURIComponent(coin)}/holders?limit=20`);
const trades = await probe("trades", `/v1/coins/${encodeURIComponent(coin)}/trades?limit=5`);

let w = wallet;
if (!w && trades) {
  const rows = Array.isArray(trades) ? trades : (trades.data ?? trades.trades ?? trades.items ?? trades.result);
  const first = Array.isArray(rows) ? rows[0] : null;
  w = first?.trader?.address ?? first?.trader ?? null;
  if (typeof w !== "string") w = null;
  if (w) console.log(`\nUsing trader ${w} from the trades response.`);
}
if (w) {
  await probe("coin-pnl", `/v1/wallet/${w}/pnl/${coin}`);
  await probe("wallet-pnl", `/v1/wallet/${w}/pnl?sort=realized&dir=desc`);
}
else console.log("\nNo wallet to check. Pass one as the second argument.");

console.log("\nSaved to tests/fixtures/tide/. Run `npm test`, then send me the JSON files if any test fails.");
void holders;
