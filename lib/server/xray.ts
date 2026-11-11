import "server-only";
import { isCoinType, isSuiAddress } from "@/lib/sui";
import type { XRayResponse, XRayResult } from "@/lib/types";
import { aggregateWallets, computeChecks, coverageOf, parseTrades, summarise } from "./analysis";
import { UpstreamError } from "./cache";
import { tokenPairs } from "./dexscreener";
import { poolTrades, tokenInfo } from "./gecko";
import { computePnl, rankTokenWallets } from "./pnl";

export async function analyseToken(rawInput: string): Promise<{ body: XRayResponse; status: number }> {
  const coinType = rawInput.trim();

  if (!isCoinType(coinType)) {
    const hint = isSuiAddress(coinType)
      ? "That looks like a package or object address. Paste the full coin type, like 0x…::module::NAME."
      : "Paste a Sui coin type, like 0x2::sui::SUI or 0x…::module::NAME.";
    return { body: { ok: false, code: "bad_input", error: hint }, status: 400 };
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
  if (poolAddress) {
    try {
      rawTrades = await poolTrades(poolAddress, coinType);
    } catch {
      tradesFailed = true;
    }
  }

  const trades = rawTrades ? parseTrades(rawTrades, coinType) : [];
  const wallets = aggregateWallets(trades, priceUsd);
  const summary = trades.length ? summarise(trades, wallets) : null;
  const pnlRows = computePnl(trades.map((trade) => ({ ...trade, token: coinType })), Date.now() - 6 * 3_600_000);
  const profitableWallets = rankTokenWallets(pnlRows).map((wallet) => ({
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
  const coverage = coverageOf(trades, ageMinutes);
  if (tradesFailed) {
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
    checks: computeChecks({ summary, coverage, liquidityUsd, marketCap, ageMinutes, hasProfile }),
    wallets: profitableWallets,
    scan: { trades: trades.length, walletsRead: pnlRows.length },
    updatedAt: Date.now(),
  };

  return { body: { ok: true, result }, status: 200 };
}
