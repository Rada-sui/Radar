# Radar

Wallet intelligence for Sui. Radar ranks wallets on profit they have actually taken out, scans any token for
its earliest buyers and obvious traps, and shows market momentum, new launches and a daily report. Read-only:
no wallet connection, no accounts, no paid tier.

Built with Next.js (App Router, TypeScript, Tailwind). Black, monochrome theme. Free data sources only.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Checks:

```bash
npm run lint
npm test             # 63 unit tests: parsers, wallet profit, ranking rules, cache
npx tsc --noEmit
```

No API keys are needed.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Landing page with the live radar, scan box and scroll-driven sections |
| `/radar` | Market momentum gauge and Trending, New and Top volume lists |
| `/xray` | Paste a Sui coin type: token stats, trap check, first 20 buyers |
| `/leaderboard` | Wallets graded Diamond, Gold and Silver on realised profit |
| `/launches` | New pools with a quick read, linking to the full X-Ray check |
| `/report` | Top runners, volume by exchange, newest pools |
| `/dashboard` | Momentum, top wallets, trending and new launches in one view |
| `/docs`, `/brand`, `/privacy`, `/terms`, `/disclaimer` | Reference and legal pages |

## How it works

```
app/                  Pages and API routes (/api/radar, /api/xray, /api/leaderboard, /api/report)
components/           UI. Header (hamburger menu), Reveal (scroll-driven reveal), RadarSweep (canvas)
lib/server/
  cache.ts            Shared fetch layer: TTL cache, request de-duplication, per-minute budget, stale fallback
  gecko.ts            GeckoTerminal client (trending, new, top pools, token info, pool trades)
  dexscreener.ts      DexScreener client (pairs, profile info)
  analysis.ts         Trade parsing, early-buyer aggregation, trap checks, momentum (pure)
  pnl.ts              Running-cost wallet profit and the ranking rules (pure)
  leaderboard.ts      Builds the board from recent trades in the most active pools
  report.ts           Daily report
lib/                  Types, formatters, Sui coin-type helpers, client data hook
tests/                node:test suites for everything pure
tools/mock-feed.mjs   Offline mock of the GeckoTerminal and DexScreener responses
```

### Ranking rules

1. Only sold profit counts. Open positions never add to rank.
2. Impossible figures are dropped: a wallet cannot realise more than it sold.
3. Recent form can only hurt: a loss in the last six hours lowers the score (up to 40%), a gain does nothing.

The score is up to 60 points for realised profit (log scale), 25 for win rate and 15 for evidence (tokens sold).
Details are on the `/docs` page.

## Data limits you should know about

These come from using only free sources.

- **Trade history.** The free feed returns the latest 300 trades per pool from the last 24 hours. X-Ray says
  whether coverage is complete (young pool, under the cap) or partial.
- **Leaderboard scope.** It is a snapshot of up to 12 of the most active pools over the last 24 hours, rebuilt
  about every 10 minutes. It is not a lifetime or 30-day record.
- **Rate limits.** GeckoTerminal allows about 30 calls a minute. Radar budgets 24, caches, de-duplicates and
  serves stale data when a limit is hit. The cache lives in memory per server instance, so on serverless
  hosting each instance keeps its own and the effective budget is higher than intended. Put a shared cache
  (for example Redis) in front before launch.
- **Not built yet.** Bundled-buy, sniper and insider share, and a dev's past launches. These need on-chain
  indexing (Sui GraphQL or gRPC), which the free market APIs do not provide.

## Environment variables

Both optional. They point the data layer at a different host, for example the mock feed.

- `GECKO_BASE` default `https://api.geckoterminal.com/api/v2`
- `DEXSCREENER_BASE` default `https://api.dexscreener.com`

### Offline development with the mock feed

```bash
node tools/mock-feed.mjs &
GECKO_BASE=http://localhost:4010/api/v2 DEXSCREENER_BASE=http://localhost:4010 npm run dev
```

Try `0xabc123::meme::MEME` in X-Ray. The mock returns the same trade set for every pool, so leaderboard
rows look repetitive. That is the mock, not the app.

## Before launch

- Verify every endpoint against the live GeckoTerminal and DexScreener APIs. This build was developed in a
  sandbox that could not reach them, so parsing is tested against the documented response shapes and a mock,
  not against live responses.
- Add a shared cache and, if you outgrow the free limits, a paid data key or your own Sui indexer.
- Have the privacy, terms and disclaimer pages reviewed and add a contact route.
- The logo lives in `public/logo.png` (header, brand page) and `app/icon.png` / `app/apple-icon.png` (favicon). Colours are tokens in `app/globals.css`, so adding an
  accent later is a small change.
- Next.js in this project differs from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/`.
