# Radar

## Intelligence for the Sui ecosystem

Radar is a read-only market-intelligence platform for discovering emerging Sui assets, understanding token activity, and identifying wallets with verifiable realised trading performance.

The product brings market discovery, token analysis, wallet intelligence, launch monitoring, and reporting into one focused interface. Radar does not connect to wallets, execute trades, custody assets, or require user accounts.

## Product capabilities

### Market radar

Radar monitors Sui market activity and presents a clear view of trending assets, trading momentum, market depth, and newly published tokens.

### X-Ray analysis

X-Ray provides a token-level investigation including:

- market data and liquidity context;
- token age and publication information;
- observed token activity and trade coverage;
- early-buyer and wallet-performance analysis;
- holder-concentration and market-risk signals;
- links to relevant ecosystem explorers and market pages.

Wallet results are based on observed trades and realised profit. Radar never pads a result set with fabricated wallet addresses or invented ROI values. If the available history does not support a result, the wallet is omitted or the relevant value is shown as unavailable.

### Wallet intelligence

Radar ranks wallets using realised profit, win rate, trading evidence, and recent performance. Open positions do not count as realised profit. Wallets with inconsistent, incomplete, or non-profitable records are excluded from profitable-wallet results.

### Launch monitoring

The launches experience focuses on newly published Sui tokens and presents the most relevant available market context for each asset.

### Leaderboards and reports

Radar consolidates market activity into wallet leaderboards, daily market reports, and dashboard views for monitoring ecosystem-wide movement.

## Data and methodology

Radar combines market and blockchain-data services according to the role each service is best suited to provide:

- GeckoTerminal and DexScreener provide market, pair, liquidity, volume, and discovery context.
- Tide provides token trade history, wallet-performance enrichment, and holder data when available.
- BlockVision provides supplementary Sui transaction and swap activity when the primary history is incomplete.
- BlockBerry provides supplementary token metadata and security context.
- Supabase/PostgreSQL stores normalized market observations, trade records, and provider synchronization data for continuity and analysis.

Provider responses are treated as evidence, not assumptions. Radar records coverage limitations and distinguishes complete, partial, unavailable, and fallback data where that distinction affects interpretation.

## Wallet ROI methodology

For each wallet and token, Radar processes trades chronologically:

1. Buys establish the wallet's running average cost basis.
2. Sells are matched against the available token position.
3. Realised profit is calculated from matched sale proceeds minus matched cost basis.
4. ROI is calculated as matched sale proceeds divided by matched cost basis.
5. Only genuinely profitable, internally consistent wallet records are ranked.

The maximum displayed wallet count is a limit, not a target. A token may return fewer than the maximum when fewer qualifying wallets are supported by the available history.

## Service boundaries

Radar is an analytics and monitoring product. It does not:

- execute trades or provide financial advice;
- connect to or control user wallets;
- custody funds or private keys;
- guarantee market-data completeness;
- treat unrealised gains as realised profit.

Coverage depends on the availability, indexing depth, and rate limits of the underlying data providers. Fallback data may be more limited than primary historical data and is labelled accordingly in the product.

## Platform areas

| Area | Purpose |
| --- | --- |
| Radar | Market momentum, trending assets, new assets, and high-activity markets |
| X-Ray | Token-specific market, activity, risk, and wallet analysis |
| Leaderboard | Wallet rankings based on the configured market-data scope |
| Launches | Recently published Sui token discovery |
| Daily report | Curated ecosystem activity and market summary |
| Dashboard | Consolidated overview of Radar's main intelligence feeds |
| Documentation | Product methodology, definitions, and service boundaries |

## Technology

Radar is built with Next.js, TypeScript, Tailwind CSS, and a server-side provider integration layer. The application uses a monochrome, information-first interface designed for fast scanning and clear interpretation of market signals.

The repository is organized around product surfaces, reusable interface components, provider adapters, normalized persistence, analysis logic, and automated tests. Provider-specific integrations remain isolated so that data-source changes do not alter the product's core ranking and validation rules.

## Product principles

- Evidence before confidence.
- Realised performance before projected performance.
- Clear coverage labels instead of hidden assumptions.
- Read-only analysis with no wallet custody or execution risk.
- Consistent definitions across X-Ray, leaderboards, reports, and dashboards.
