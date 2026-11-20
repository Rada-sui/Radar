import "server-only";
import { isCoinType, isSuiAddress } from "@/lib/sui";
import type { XRayResponse, XRayResult, XRayWallet } from "@/lib/types";
import { aggregateWallets, computeChecks, coverageOf, parseTrades, summarise } from "./analysis";
import { UpstreamError } from "./cache";
import { tokenPairs } from "./dexscreener";
import { poolTrades, tokenInfo } from "./gecko";
import { computePnl, rankTokenWallets } from "./pnl";
import { enrichWithTide, tideCoinTrades, tideEnabled, tidePackagePublishedAt } from "./tide";
import { holderCheck } from "./tide-parse";
import { blockVisionCoinTrades } from "./blockvision";
import { blockberryCoinInfo } from "./blockberry";
import { persistTrades } from "./persistence";

const MAX_WALLETS_RETURNED = 30;

export async function analyseToken(rawInput: string): Promise<{ body: XRayResponse; status: number }> {
  const coinType = rawInput.trim();

  if (!isCoinType(coinType)) {
    const hint = isSuiAddress(coinType)
      ? "That looks like a package or object address. Paste the full coin type, like 0x…::module::NAME."
      : "Paste a Sui coin type, like 0x2::sui::SUI or 0x…::module::NAME.";
    return { body: { ok: false, code: "bad_input", error: hint }, status: 400 };
  }

  if (!tideEnabled()) {
    return {
      body: { ok: false, code: "upstream", error: "Tide is not configured. Set TIDE_API_KEY to scan wallet performance." },
      status: 503,
    };
  }

  const [infoR, pairsR, blockberryR] = await Promise.allSettled([
    tokenInfo(coinType),
    tokenPairs(coinType),
    blockberryCoinInfo(coinType),
  ]);
  const info = infoR.status === "fulfilled" ? infoR.value : null;
  const pairs = pairsR.status === "fulfilled" ? pairsR.value : [];
  const blockberry = blockberryR.status === "fulfilled" ? blockberryR.value : null;

  if (!info && pairs.length === 0) {
    const limited = [infoR, pairsR].some(
      (r) => r.status === "rejected" && r.reason instanceof UpstreamError && r.reason.kind === "rate_limited",
    );
    const failed = infoR.status === "rejected" && pairsR.status === "rejected";
    if (limited) {
      return {
        body: {
          ok: false,
          code: "rate_limited",
          error: "The data sources are busy.",
          retryAfterSeconds: 60,
        },
        status: 429,
      };
    }
    if (failed) {
      return {
        body: { ok: false, code: "upstream", error: "The market data provider is temporarily unavailable. Try again shortly." },
        status: 502,
      };
    }
    return {
      body: {
        ok: false,
        code: "not_found",
        error: "No pools were found for that token on Sui. Check the coin type, or the token may not trade yet.",
      },
      status: 404,
    };
  }

  // If the token has a newly-created pool, use that recent pair so X-Ray
  // matches the Launches card instead of jumping to an older, deeper pool for
  // the same coin type.
  const recentCutoff = Date.now() - 24 * 60 * 60_000;
  const recentPairs = pairs.filter((pair) => pair.createdAt !== null && pair.createdAt >= recentCutoff);
  const best = (recentPairs.length > 0 ? recentPairs : pairs)[0] ?? null;
  const poolAddress = best?.pairAddress ?? info?.topPools[0] ?? null;
  if (!poolAddress) {
    return {
      body: { ok: false, code: "not_found", error: "This token is known, but no active Sui pool was found for it." },
      status: 404,
    };
  }
  let rawTrades: Record<string, unknown>[] | null = null;
  let tradesFailed = false;
  try {
    rawTrades = await poolTrades(poolAddress, coinType);
  } catch {
    tradesFailed = true;
  }
  const packagePublishedAt = await tidePackagePublishedAt(coinType.split("::")[0]).catch(() => null);
  const ageMinutes = packagePublishedAt === null ? null : Math.max(0, (Date.now() - packagePublishedAt) / 60_000);
  const priceUsd = info?.priceUsd ?? best?.priceUsd ?? null;

  // Tide supplies the token-wide all-time trade history. Gecko remains the
  // explicit, limited fallback when Tide cannot answer.
  let tideTrades: Awaited<ReturnType<typeof tideCoinTrades>> = null;
  let usedGeckoFallback = false;
  try {
    tideTrades = await tideCoinTrades(coinType);
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 402) {
      // Keep X-Ray usable on Tide credit exhaustion. The capped Gecko feed is
      // a limited fallback, and the coverage note below makes that explicit.
      tideTrades = null;
    }
  }
  const geckoTrades = rawTrades ? parseTrades(rawTrades, coinType) : [];
  let blockVisionTrades: Awaited<ReturnType<typeof blockVisionCoinTrades>> = null;
  if (tideTrades === null) {
    blockVisionTrades = await blockVisionCoinTrades(coinType).catch(() => null);
  }
  let trades = tideTrades ?? (geckoTrades.length ? geckoTrades : (blockVisionTrades ?? []));
  if (tideTrades === null && blockVisionTrades && geckoTrades.length > 0) {
    const geckoRanked = rankTokenWallets(computePnl(geckoTrades.map((trade) => ({ ...trade, token: coinType })), 0));
    const blockVisionRanked = rankTokenWallets(computePnl(blockVisionTrades.map((trade) => ({ ...trade, token: coinType })), 0));
    if (blockVisionRanked.length > geckoRanked.length) trades = blockVisionTrades;
  }
  usedGeckoFallback = tideTrades === null;
  let wallets = aggregateWallets(trades, priceUsd);
  let summary = trades.length ? summarise(trades, wallets) : null;
  let pnlRows = computePnl(trades.map((trade) => ({ ...trade, token: coinType })), 0);
  let rankedWallets = rankTokenWallets(pnlRows);

  // Tide may answer with a thin or partially indexed history. In that case,
  // ask BlockVision for an independent trade set and use it only when it
  // produces more valid profitable wallets.
  if (tideTrades !== null && rankedWallets.length < 10) {
    blockVisionTrades = await blockVisionCoinTrades(coinType).catch(() => null);
    if (blockVisionTrades) {
      const blockVisionRanked = rankTokenWallets(computePnl(blockVisionTrades.map((trade) => ({ ...trade, token: coinType })), 0));
      if (blockVisionRanked.length > rankedWallets.length) {
        trades = blockVisionTrades;
        wallets = aggregateWallets(trades, priceUsd);
        summary = trades.length ? summarise(trades, wallets) : null;
        pnlRows = computePnl(trades.map((trade) => ({ ...trade, token: coinType })), 0);
        rankedWallets = blockVisionRanked;
      }
    }
  }

  const tradeSource = trades === blockVisionTrades ? "blockvision" : tideTrades ? "tide" : "geckoterminal";
  void persistTrades(coinType, trades, tradeSource);
  const profitableWallets: XRayWallet[] = rankedWallets.slice(0, MAX_WALLETS_RETURNED).map((wallet) => ({
    address: wallet.address,
    tier: wallet.tier,
    roiMultiple: wallet.roiMultiple,
    firstBuyAt: wallet.firstBuyAt,
    lastSellAt: wallet.lastSellAt,
    buys: wallet.buys,
    sells: wallet.sells,
    boughtUsd: wallet.boughtUsd,
    soldUsd: wallet.soldUsd,
    boughtTokens: wallet.boughtTokens,
    soldTokens: wallet.soldTokens,
    realisedUsd: wallet.realised,
    averageEntryUsd: wallet.boughtTokens > 0 ? wallet.boughtUsd / wallet.boughtTokens : null,
    averageExitUsd: wallet.soldTokens > 0 ? wallet.soldUsd / wallet.soldTokens : null,
    holdTimeMs: wallet.firstBuyAt !== null && wallet.lastSellAt !== null ? Math.max(0, wallet.lastSellAt - wallet.firstBuyAt) : null,
    partial: wallet.partial,
  }));
  // Tide is the authoritative wallet-performance source. Gecko still supplies
  // the candidate wallet addresses because Tide's endpoints do not enumerate
  // all wallets trading an arbitrary token.
  const tide = await enrichWithTide(
    coinType,
    profitableWallets.map((w) => w.address),
  );
  // A token with no locally observed profitable wallets is still a valid X-Ray
  // result. Tide is only required to enrich wallets that we actually found.
  if (!usedGeckoFallback && profitableWallets.length > 0 && (tide.status === "unavailable" || tide.walletsChecked === 0)) {
    return {
      body: { ok: false, code: "upstream", error: "Tide wallet-performance data was unavailable for the wallets found in this scan. Try again shortly." },
      status: 502,
    };
  }
  for (const w of profitableWallets) {
    const lifetime = tide.lifetime.get(w.address);
    if (lifetime) {
      w.lifetime = lifetime;
      if (w.roiMultiple === null) {
        const tideCost = lifetime.soldUsd !== null && lifetime.realisedUsd !== null
          ? lifetime.soldUsd - lifetime.realisedUsd
          : null;
        if (tideCost !== null && tideCost > 0 && lifetime.soldUsd !== null) {
          w.roiMultiple = lifetime.soldUsd / tideCost;
        } else if (lifetime.roiPct !== null && Number.isFinite(lifetime.roiPct)) {
          w.roiMultiple = 1 + lifetime.roiPct / 100;
        }
      }
    }
    // Last-resort display fallback when matching and Tide both lack a cost
    // basis. This is deliberately after the realised-cost calculation so open
    // positions cannot turn a profitable realised trade into a 0.x multiple.
    if (w.roiMultiple === null && w.boughtUsd > 0 && w.soldUsd > 0) {
      const fallback = w.soldUsd / w.boughtUsd;
      if (fallback > 1) w.roiMultiple = fallback;
    }
  }
  const holderRow = holderCheck(tide.holders);
  const coverage = coverageOf(trades, ageMinutes);
  if (usedGeckoFallback) {
    coverage.note = tradeSource === "blockvision"
      ? "Tide all-time history was unavailable. BlockVision supplied supplementary swap activity; coverage may be partial."
      : "Tide all-time history was unavailable, so this scan uses GeckoTerminal's limited recent trade feed.";
  } else if (tradesFailed) {
    coverage.note = "Trade history could not be loaded right now, so buyer details are missing. Try again in a minute.";
  }
  // Keep X-Ray aligned with list pages: use the selected pair's market cap
  // first, then token metadata, then FDV as the same fallback as parsePool.
  const marketCap = best?.marketCap ?? info?.marketCap ?? best?.fdv ?? info?.fdv ?? null;
  const liquidityUsd = best?.liquidityUsd ?? info?.liquidityUsd ?? null;
  const hasProfile = best ? best.hasProfile : null;

  const result: XRayResult = {
    token: {
      address: coinType,
      symbol: info?.symbol ?? blockberry?.symbol ?? best?.baseSymbol ?? "?",
      name: info?.name ?? blockberry?.name ?? best?.baseName ?? "Unknown token",
      imageUrl: info?.imageUrl ?? blockberry?.imageUrl ?? best?.imageUrl ?? null,
      priceUsd,
      marketCap,
      fdv: info?.fdv ?? best?.fdv ?? null,
      liquidityUsd,
      volumeH24: best?.volumeH24 ?? info?.volumeH24 ?? null,
      changeH24: best?.changeH24 ?? null,
      ageMinutes,
      pairAddress: poolAddress,
      dex: best?.dexId ?? null,
      hasProfile,
      links: {
        gecko: poolAddress ? `https://www.geckoterminal.com/sui-network/pools/${poolAddress}` : null,
        dexscreener: best?.url ?? null,
      },
    },
    coverage,
    summary,
    checks: [
      ...computeChecks({ summary, coverage, liquidityUsd, marketCap, ageMinutes, hasProfile }),
      ...(holderRow ? [holderRow] : []),
    ],
    wallets: profitableWallets,
    scan: { trades: trades.length, walletsRead: pnlRows.length },
    tide: { status: tide.status, holders: tide.holders, walletsChecked: tide.walletsChecked },
    updatedAt: Date.now(),
  };

  return { body: { ok: true, result }, status: 200 };
}
