import "server-only";
import { isCoinType, isSuiAddress } from "@/lib/sui";
import type { XRayResponse, XRayResult, XRayWallet } from "@/lib/types";
import { aggregateWallets, computeChecks, coverageOf, parseTrades, summarise } from "./analysis";
import { UpstreamError } from "./cache";
import { tokenPairs } from "./dexscreener";
import { poolTrades, tokenInfo } from "./gecko";
import { computePnl, rankTokenWallets } from "./pnl";
import { enrichWithTide, tideCoinTrades, tideEnabled } from "./tide";
import { holderCheck } from "./tide-parse";

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

  const [infoR, pairsR] = await Promise.allSettled([tokenInfo(coinType), tokenPairs(coinType)]);
  const info = infoR.status === "fulfilled" ? infoR.value : null;
  const pairs = pairsR.status === "fulfilled" ? pairsR.value : [];

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

  const best = pairs[0] ?? null;
  const poolAddress = best?.pairAddress ?? info?.topPools[0] ?? null;
  if (!poolAddress) {
    return {
      body: { ok: false, code: "not_found", error: "This token is known, but no active Sui pool was found for it." },
      status: 404,
    };
  }
  const ageMinutes = best?.createdAt ? Math.max(0, (Date.now() - best.createdAt) / 60_000) : null;
  const priceUsd = info?.priceUsd ?? best?.priceUsd ?? null;

  let rawTrades: Record<string, unknown>[] | null = null;
  let tradesFailed = false;
  try {
    rawTrades = await poolTrades(poolAddress, coinType);
  } catch {
    tradesFailed = true;
  }

  // Tide supplies the token-wide 30-day trade history. Do not silently fall
  // back to Gecko here: its free feed is capped and would violate X-Ray's
  // 30-day wallet contract.
  let tideTrades: Awaited<ReturnType<typeof tideCoinTrades>> = null;
  let usedGeckoFallback = false;
  try {
    tideTrades = await tideCoinTrades(coinType);
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 402) {
      return {
        body: { ok: false, code: "upstream", error: "Tide has run out of API credits for this account. Add credits or try again after the daily limit resets." },
        status: 503,
      };
    }
  }
  const trades = tideTrades ?? (rawTrades ? parseTrades(rawTrades, coinType) : []);
  usedGeckoFallback = tideTrades === null;
  const wallets = aggregateWallets(trades, priceUsd);
  const summary = trades.length ? summarise(trades, wallets) : null;
  const pnlRows = computePnl(trades.map((trade) => ({ ...trade, token: coinType })), Date.now() - 30 * 86_400_000);
  const profitableWallets: XRayWallet[] = rankTokenWallets(pnlRows).map((wallet) => ({
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
    if (lifetime) w.lifetime = lifetime;
  }
  const holderRow = holderCheck(tide.holders);
  const coverage = coverageOf(trades, ageMinutes);
  if (usedGeckoFallback) {
    coverage.note = "Tide 30-day history was unavailable, so this scan uses GeckoTerminal's limited recent trade feed.";
  } else if (tradesFailed) {
    coverage.note = "Trade history could not be loaded right now, so buyer details are missing. Try again in a minute.";
  }
  const marketCap = info?.marketCap ?? best?.marketCap ?? null;
  const liquidityUsd = best?.liquidityUsd ?? info?.liquidityUsd ?? null;
  const hasProfile = best ? best.hasProfile : null;

  const result: XRayResult = {
    token: {
      address: coinType,
      symbol: info?.symbol ?? best?.baseSymbol ?? "?",
      name: info?.name ?? best?.baseName ?? "Unknown token",
      imageUrl: info?.imageUrl ?? best?.imageUrl ?? null,
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
