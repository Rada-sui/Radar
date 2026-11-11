"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtAge, fmtPct, fmtUsd, toneClass } from "@/lib/format";
import type { Momentum, RadarFeed, RadarToken, RadarView } from "@/lib/types";
import { ShowCount } from "./ui";

const VIEWS: { id: RadarView; label: string; hint: string }[] = [
  { id: "trending", label: "Trending", hint: "Pools drawing the most attention in the last hour" },
  { id: "new", label: "New", hint: "Pools created most recently" },
  { id: "top", label: "Top volume", hint: "Biggest pools by 24 hour volume" },
];

const REFRESH_MS = 60_000;
const SEGMENTS: Momentum["label"][] = ["Low", "Fair", "Good", "Very good"];

export default function RadarBoard() {
  const [view, setView] = useState<RadarView>("trending");
  const [feed, setFeed] = useState<RadarFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(10);
  const seq = useRef(0);

  const load = useCallback(async (v: RadarView) => {
    const mine = ++seq.current;
    try {
      const res = await fetch(`/api/radar?view=${v}`);
      const json = (await res.json()) as RadarFeed;
      if (mine === seq.current) setFeed(json);
    } catch {
      if (mine === seq.current) setFeed({ ok: false, error: "Could not reach the data feed." });
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching on mount is the point of this effect; state is set after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    load(view);
    const id = setInterval(() => load(view), REFRESH_MS);
    return () => clearInterval(id);
  }, [view, load]);

  const tokens = feed && feed.ok ? feed.tokens : [];
  const momentum = feed && feed.ok ? feed.momentum : null;
  const active = VIEWS.find((v) => v.id === view)!;

  return (
    <div>
      <Gauge momentum={momentum} loading={loading && !feed} />

      <div className="mt-14">
        <div role="tablist" aria-label="Token list" className="flex gap-1 border-b border-line">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              type="button"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                view === v.id
                  ? "border-white text-white"
                  : "border-transparent text-dim hover:text-white"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-dim">{active.hint}.</p>

        <div className="mt-6" aria-live="polite" aria-busy={loading}>
          {loading && !feed && <p className="py-10 text-dim">Loading tokens.</p>}
          {feed && !feed.ok && (
            <div className="border border-line-strong p-6">
              <p className="font-medium">Tokens could not be loaded.</p>
              <p className="mt-2 text-sm text-dim">{feed.error} Radar retries every minute.</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  load(view);
                }}
                className="mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-white"
              >
                Try again
              </button>
            </div>
          )}
          {feed && feed.ok && tokens.length === 0 && (
            <p className="py-10 text-dim">No tokens to show for this list right now.</p>
          )}
          {tokens.length > 0 && (
            <>
              <div className="mb-4"><ShowCount count={tokens.length} value={show} onChange={setShow} /></div>
              <TokenTable tokens={tokens.slice(0, show)} />
            </>
          )}
        </div>

        {feed && feed.ok && (
          <p className="num mt-4 text-xs text-faint">
            Updated {new Date(feed.updatedAt).toLocaleTimeString()}. Sources: GeckoTerminal.
          </p>
        )}
      </div>
    </div>
  );
}

function Gauge({ momentum, loading }: { momentum: Momentum | null; loading: boolean }) {
  const idx = momentum ? SEGMENTS.indexOf(momentum.label) : -1;
  return (
    <div className="border border-line p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-sm text-dim">Market momentum</h2>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {momentum ? momentum.label : loading ? "Reading" : "No reading"}
          </p>
        </div>
        {momentum && (
          <p className="num text-right text-sm text-dim">
            <span className="block text-3xl text-white">{momentum.score}</span>
            out of 100
          </p>
        )}
      </div>

      <div
        className="mt-6"
        role="img"
        aria-label={momentum ? `Momentum ${momentum.label}, ${momentum.score} out of 100` : "No momentum reading"}
      >
        <div className="relative grid grid-cols-4 gap-1.5">
          {SEGMENTS.map((s, i) => (
            <div
              key={s}
              className={`h-2 transition-colors duration-700 ${
                idx >= i ? "bg-white" : "bg-white/12"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-xs text-faint">
          {SEGMENTS.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>

      {momentum && (
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-dim">
          {momentum.positiveShare !== null && (
            <>
              <span className="num text-white">{Math.round(momentum.positiveShare * 100)}%</span> of the{" "}
              {momentum.sample} tokens on this list are up over the last hour.{" "}
            </>
          )}
          {momentum.buyShare !== null && (
            <>
              <span className="num text-white">{Math.round(momentum.buyShare * 100)}%</span> of their trades
              were buys.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function TokenTable({ tokens }: { tokens: RadarToken[] }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <caption className="sr-only">Sui tokens with market data</caption>
        <thead>
          <tr className="border-b border-line-strong text-sm text-faint">
            <th scope="col" className="py-3 pr-4 font-normal">Token</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Age</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Market cap</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Liquidity</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Volume 1h</th>
            <th scope="col" className="py-3 pl-4 text-right font-normal">Change 1h</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr key={t.address} className="border-b border-line transition-colors hover:bg-white/[0.03]">
              <td className="py-4 pr-4">
                <Link href={`/xray?ca=${encodeURIComponent(t.address)}`} className="block">
                  <span className="block font-medium">{t.symbol}</span>
                  <span className="block max-w-[14rem] truncate text-sm text-dim">{t.name}</span>
                </Link>
              </td>
              <td className="num px-4 py-4 text-right text-sm text-dim">{fmtAge(t.ageMinutes)}</td>
              <td className="num px-4 py-4 text-right text-sm">{fmtUsd(t.marketCap)}</td>
              <td className="num px-4 py-4 text-right text-sm text-dim">{fmtUsd(t.liquidityUsd)}</td>
              <td className="num px-4 py-4 text-right text-sm">{fmtUsd(t.volumeH1)}</td>
              <td className={`num py-4 pl-4 text-right text-sm ${toneClass(t.changeH1)}`}>
                {fmtPct(t.changeH1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
