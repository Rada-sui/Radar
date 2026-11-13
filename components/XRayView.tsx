"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { fmtAge, fmtAgo, fmtPct, fmtRoi, fmtUsd, shortAddr, toneClass } from "@/lib/format";
import { explorerAccount, explorerCoin } from "@/lib/sui";
import type { CheckLevel, TideLifetime, XRayCheck, XRayResponse, XRayResult, XRayWallet } from "@/lib/types";
import { ShowCount } from "./ui";

type Loaded = { key: string; res: XRayResponse };

export default function XRayView() {
  const router = useRouter();
  const params = useSearchParams();
  const ca = (params.get("ca") ?? "").trim();
  const [input, setInput] = useState(ca);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!ca) return;
    const ctrl = new AbortController();
    fetch(`/api/xray?ca=${encodeURIComponent(ca)}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<XRayResponse>)
      .then((res) => setLoaded({ key: ca, res }))
      .catch((e) => {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setLoaded({ key: ca, res: { ok: false, code: "upstream", error: "The market data provider is temporarily unavailable. Try again shortly." } });
      });
    return () => ctrl.abort();
  }, [ca]);

  const current = loaded && loaded.key === ca ? loaded.res : null;
  const loading = ca !== "" && current === null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v) router.push(`/xray?ca=${encodeURIComponent(v)}`);
  };

  return (
    <div>
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        <label htmlFor="xray-ca" className="sr-only">
          Token address or coin type
        </label>
        <input
          id="xray-ca"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="0x…::module::TOKEN"
          className="num min-w-0 flex-1 rounded-full border border-line-strong bg-panel px-5 py-3.5 text-sm text-white placeholder:text-faint focus:border-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/85 disabled:opacity-60"
        >
          {loading ? "Scanning" : "Scan token"}
        </button>
      </form>

      <div className="mt-12" aria-live="polite" aria-busy={loading}>
        {!ca && <Empty />}
        {loading && <Scanning />}
        {current && !current.ok && <Failure res={current} />}
        {current && current.ok && <Report r={current.result} />}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="max-w-2xl border-t border-line pt-8">
      <h2 className="text-lg font-semibold">Paste a Sui coin type to start.</h2>
      <p className="mt-3 leading-relaxed text-dim">
        A coin type has three parts: the package, the module and the token name, for example{" "}
        <span className="num text-white">0x2::sui::SUI</span>. You can copy it from the token page on a Sui
        explorer, or pick a token from the Radar list.
      </p>
    </div>
  );
}

function Scanning() {
  return (
    <div className="max-w-2xl border-t border-line pt-8">
      <p className="text-lg font-semibold">Reading the pool and its trades.</p>
      <div className="mt-5 h-px w-full overflow-hidden bg-white/12">
        <div className="h-px w-1/3 animate-[slide_1.2s_ease-in-out_infinite] bg-white" />
      </div>
      <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
        @media (prefers-reduced-motion: reduce){.animate-\\[slide_1\\.2s_ease-in-out_infinite\\]{animation:none}}`}</style>
    </div>
  );
}

function Failure({ res }: { res: Extract<XRayResponse, { ok: false }> }) {
  const [seconds, setSeconds] = useState(res.retryAfterSeconds ?? 0);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [seconds]);
  const title =
    res.code === "bad_input"
      ? "That is not a coin type."
      : res.code === "not_found"
        ? "No pools found for that token."
        : res.code === "rate_limited"
        ? "The data sources are busy."
        : "The market data provider is temporarily unavailable.";
  return (
    <div className="max-w-2xl border border-line-strong p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-dim">{res.error}{res.code === "rate_limited" && seconds > 0 ? ` Retry in ${seconds}s.` : ""}</p>
    </div>
  );
}

const LEVEL: Record<CheckLevel, { label: string; cls: string }> = {
  ok: { label: "Clear", cls: "text-dim" },
  watch: { label: "Watch", cls: "text-white" },
  risk: { label: "Risk", cls: "text-loss" },
};

function Report({ r }: { r: XRayResult }) {
  const [show, setShow] = useState(10);
  const [expanded, setExpanded] = useState<string | null>(null);
  const t = r.token;
  return (
    <div className="space-y-14">
      {/* Token header */}
      <div>
        <div className="flex flex-wrap items-center gap-4">
          {t.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.imageUrl} alt="" width={48} height={48} className="h-12 w-12 rounded-full bg-raise object-cover" />
          )}
          <div className="min-w-0">
            <h2 className="font-display text-3xl font-semibold tracking-tight">{t.symbol}</h2>
            <p className="truncate text-dim">{t.name}</p>
          </div>
        </div>
        <p className="num mt-3 break-all text-xs text-faint">{t.address}</p>
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Price" value={fmtUsd(t.priceUsd)} />
          <Stat label="Market cap" value={fmtUsd(t.marketCap ?? t.fdv)} />
          <Stat label="Liquidity" value={fmtUsd(t.liquidityUsd)} />
          <Stat label="Volume 24h" value={fmtUsd(t.volumeH24)} />
          <Stat label="Change 24h" value={fmtPct(t.changeH24)} tone={toneClass(t.changeH24)} />
          <Stat label="Pool age" value={fmtAge(t.ageMinutes)} />
        </dl>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {t.links.gecko && (
            <a href={t.links.gecko} target="_blank" rel="noreferrer" className="text-dim underline underline-offset-4 hover:text-white">
              GeckoTerminal
            </a>
          )}
          {t.links.dexscreener && (
            <a href={t.links.dexscreener} target="_blank" rel="noreferrer" className="text-dim underline underline-offset-4 hover:text-white">
              DexScreener
            </a>
          )}
          <a href={explorerCoin(t.address)} target="_blank" rel="noreferrer" className="text-dim underline underline-offset-4 hover:text-white">
            Suiscan
          </a>
        </p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-xl font-medium tracking-tight">Profitable wallets</h3>
            <p className="mt-2 text-sm text-dim">{r.scan.trades} trades read across {r.scan.walletsRead} wallets.</p>
          </div>
          <ShowCount count={r.wallets.length} value={show} onChange={setShow} />
        </div>
        {r.wallets.length === 0 ? (
          <p className="mt-6 border-t border-line pt-5 text-dim">No profitable wallets in the trades we can see.</p>
        ) : (
          <div className="mt-5 space-y-2">
            {r.wallets.slice(0, show).map((wallet) => (
              <WalletRow key={wallet.address} wallet={wallet} open={expanded === wallet.address} onToggle={() => setExpanded(expanded === wallet.address ? null : wallet.address)} />
            ))}
          </div>
        )}
      </section>

      {/* Checks */}
      {r.checks.length > 0 && (
        <section>
          <details className="border-t border-line pt-5">
            <summary className="cursor-pointer font-display text-xl font-medium tracking-tight">Trap check</summary>
          <ul className="mt-5 border-b border-line">
            {r.checks.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
          </details>
        </section>
      )}

      <p className="num text-xs text-faint">
        Updated {new Date(r.updatedAt).toLocaleTimeString()}. Sources: GeckoTerminal, DexScreener
        {r.tide && (r.tide.status === "ok" || r.tide.status === "partial") ? ", Tide" : ""}.
      </p>
    </div>
  );
}

function WalletRow({ wallet: w, open, onToggle }: { wallet: XRayWallet; open: boolean; onToggle: () => void }) {
  const hold = w.holdTimeMs === null ? "n/a" : fmtAge(w.holdTimeMs / 60_000);
  return (
    <div className="border border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left">
        <span className="num min-w-0 flex-1 text-sm">{shortAddr(w.address, 4, 4)}</span>
        <span className="rounded-full border border-white/50 px-2 py-0.5 text-xs">{w.tier}</span>
        <span className="num text-sm text-gain">{fmtRoi(w.roiMultiple)}</span>
        <span aria-hidden="true" className="text-dim">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-4 text-sm">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Realised profit" value={fmtUsd(w.realisedUsd)} tone="text-gain" />
            <Stat label="Bought" value={`${fmtUsd(w.boughtUsd)} / ${w.boughtTokens.toLocaleString()} tokens`} />
            <Stat label="Sold" value={`${fmtUsd(w.soldUsd)} / ${w.soldTokens.toLocaleString()} tokens`} />
            <Stat label="Entry / exit" value={`${fmtUsd(w.averageEntryUsd)} / ${fmtUsd(w.averageExitUsd)}`} />
            <Stat label="Buys / sells" value={`${w.buys} / ${w.sells}`} />
            <Stat label="First buy" value={fmtAgo(w.firstBuyAt)} />
            <Stat label="Last sell" value={fmtAgo(w.lastSellAt)} />
            <Stat label="Hold time" value={hold} />
          </dl>
          {w.lifetime && <Lifetime l={w.lifetime} />}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-dim">
            <span className="num break-all">{w.address}</span>
            <button type="button" className="cursor-pointer underline underline-offset-4" onClick={() => void navigator.clipboard?.writeText(w.address)}>Copy</button>
            <a href={explorerAccount(w.address)} target="_blank" rel="noreferrer" className="underline underline-offset-4">View on Suiscan</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Lifetime({ l }: { l: TideLifetime }) {
  const tone = (n: number | null) => (n === null ? undefined : n > 0 ? "text-gain" : n < 0 ? "text-loss" : undefined);
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="text-sm font-medium">Whole history in this token</p>
      <p className="mt-1 text-xs text-dim">From Tide. Not limited to the last 24 hours.</p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Realised profit" value={fmtUsd(l.realisedUsd)} tone={tone(l.realisedUsd)} />
        <Stat label="Still held (unrealised)" value={fmtUsd(l.unrealisedUsd)} tone={tone(l.unrealisedUsd)} />
        <Stat label="Total profit" value={fmtUsd(l.pnlUsd)} tone={tone(l.pnlUsd)} />
        <Stat label="Return on spend" value={fmtPct(l.roiPct)} tone={tone(l.roiPct)} />
        <Stat label="Bought" value={fmtUsd(l.boughtUsd)} />
        <Stat label="Sold" value={fmtUsd(l.soldUsd)} />
        <Stat label="First buy" value={fmtAgo(l.firstBuyAt)} />
        <Stat label="Last trade" value={fmtAgo(l.lastTradeAt)} />
      </dl>
      {l.complete === false && (
        <p className="mt-3 text-xs text-dim">Tide is still reading this wallet&apos;s history, so these figures may be incomplete.</p>
      )}
      {l.notes.length > 0 && <p className="mt-3 text-xs text-dim">{l.notes.join(" ")}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-sm text-faint">{label}</dt>
      <dd className={`num mt-1 text-lg ${tone ?? "text-white"}`}>{value}</dd>
    </div>
  );
}

function CheckRow({ c }: { c: XRayCheck }) {
  const l = LEVEL[c.level];
  return (
    <li className="grid gap-1 border-t border-line py-4 sm:grid-cols-[5rem_14rem_1fr] sm:gap-6">
      <span className={`text-sm font-semibold ${l.cls}`}>{l.label}</span>
      <span className="font-medium">{c.label}</span>
      <span className="text-sm leading-relaxed text-dim">{c.detail}</span>
    </li>
  );
}

