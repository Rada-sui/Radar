"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { fmtAge, fmtAgo, fmtPct, fmtUsd, shortAddr, toneClass } from "@/lib/format";
import { explorerAccount, explorerCoin } from "@/lib/sui";
import type { CheckLevel, XRayCheck, XRayResponse, XRayResult, XRayWallet } from "@/lib/types";

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
        setLoaded({
          key: ca,
          res: { ok: false, code: "upstream", error: "Could not reach Radar. Check your connection and try again." },
        });
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
  const title =
    res.code === "bad_input"
      ? "That is not a coin type."
      : res.code === "not_found"
        ? "No pools found for that token."
        : res.code === "rate_limited"
          ? "The data sources are busy."
          : "The data sources did not respond.";
  return (
    <div className="max-w-2xl border border-line-strong p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-dim">{res.error}</p>
    </div>
  );
}

const LEVEL: Record<CheckLevel, { label: string; cls: string }> = {
  ok: { label: "Clear", cls: "text-dim" },
  watch: { label: "Watch", cls: "text-white" },
  risk: { label: "Risk", cls: "text-loss" },
};

function Report({ r }: { r: XRayResult }) {
  const t = r.token;
  const s = r.summary;
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

      {/* Coverage */}
      <div className="border border-line-strong p-5">
        <p className="font-medium">
          {r.coverage.kind === "complete"
            ? "Full buyer history"
            : r.coverage.kind === "partial"
              ? "Partial buyer history"
              : "No buyer history"}
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-dim">{r.coverage.note}</p>
      </div>

      {/* Checks */}
      {r.checks.length > 0 && (
        <section>
          <h3 className="font-display text-xl font-medium tracking-tight">Trap check</h3>
          <ul className="mt-5 border-b border-line">
            {r.checks.map((c) => (
              <CheckRow key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}

      {/* Summary */}
      {s && (
        <section>
          <h3 className="font-display text-xl font-medium tracking-tight">What the trades show</h3>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
            <Stat label="Trades read" value={String(s.trades)} />
            <Stat label="Buyers" value={String(s.uniqueBuyers)} />
            <Stat label="Sellers" value={String(s.uniqueSellers)} />
            <Stat label="Buy volume" value={fmtUsd(s.buyUsd)} />
            <Stat label="Sell volume" value={fmtUsd(s.sellUsd)} />
            <Stat
              label="Top-ten buyer share"
              value={s.topTenBuyShare === null ? "n/a" : `${Math.round(s.topTenBuyShare * 100)}%`}
            />
            <Stat
              label="First buyers still holding"
              value={s.earlyCount ? `${s.earlyHolding} of ${s.earlyCount}` : "n/a"}
            />
          </dl>
        </section>
      )}

      {/* Early buyers */}
      {r.earlyBuyers.length > 0 && (
        <section>
          <h3 className="font-display text-xl font-medium tracking-tight">
            {r.coverage.kind === "complete" ? "First 20 buyers" : "Earliest buyers in this window"}
          </h3>
          <Wallets rows={r.earlyBuyers} />
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-faint">
            Realised profit counts only what a wallet has sold, at its average buy price. Open positions are
            not counted. A dagger marks a wallet that sold more than it bought in this window, so part of its
            position is older than the data.
          </p>
        </section>
      )}

      <p className="num text-xs text-faint">
        Updated {new Date(r.updatedAt).toLocaleTimeString()}. Sources: GeckoTerminal, DexScreener.
      </p>
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

function Wallets({ rows }: { rows: XRayWallet[] }) {
  return (
    <div className="-mx-5 mt-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption className="sr-only">Earliest buyers and what they did next</caption>
        <thead>
          <tr className="border-b border-line-strong text-sm text-faint">
            <th scope="col" className="py-3 pr-4 font-normal">Wallet</th>
            <th scope="col" className="px-4 py-3 font-normal">First bought</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Bought</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Sold</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Realised</th>
            <th scope="col" className="py-3 pl-4 font-normal">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.address} className="border-b border-line">
              <td className="num py-3.5 pr-4 text-sm">
                <a
                  href={explorerAccount(w.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/30 underline-offset-4 hover:decoration-white"
                >
                  {shortAddr(w.address, 6, 4)}
                </a>
              </td>
              <td className="px-4 py-3.5 text-sm text-dim">{fmtAgo(w.firstBuyAt)}</td>
              <td className="num px-4 py-3.5 text-right text-sm">{fmtUsd(w.boughtUsd)}</td>
              <td className="num px-4 py-3.5 text-right text-sm text-dim">{fmtUsd(w.soldUsd)}</td>
              <td className={`num px-4 py-3.5 text-right text-sm ${toneClass(w.realisedUsd)}`}>
                {w.realisedUsd > 0 ? "+" : w.realisedUsd < 0 ? "-" : ""}
                {fmtUsd(Math.abs(w.realisedUsd))}
                {w.soldBeforeWindow && <span title="Sold more than it bought in this window"> †</span>}
              </td>
              <td className="py-3.5 pl-4 text-sm text-dim">{w.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
