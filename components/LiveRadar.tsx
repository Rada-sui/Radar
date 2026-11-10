"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RadarSweep, { type Blip } from "./RadarSweep";
import { fmtPct, fmtUsd, toneClass } from "@/lib/format";
import type { RadarFeed, RadarToken } from "@/lib/types";

const REFRESH_MS = 60_000;

function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0xffffffff;
}

function toBlip(t: RadarToken): Blip {
  const v = Math.max(t.volumeH1 ?? 0, 0);
  // More hourly volume sits closer to the centre.
  const heat = Math.min(Math.log10(v + 1) / 6.5, 1);
  return {
    id: t.address,
    angle: hash01(t.address) * Math.PI * 2,
    radius: 0.18 + 0.78 * (1 - heat),
  };
}

export default function LiveRadar() {
  const [feed, setFeed] = useState<RadarFeed | null>(null);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    const load = async () => {
      try {
        const res = await fetch("/api/radar", { signal: ctrl.signal });
        const json = (await res.json()) as RadarFeed;
        if (alive) setFeed(json);
      } catch {
        if (alive && !ctrl.signal.aborted) {
          setFeed({ ok: false, error: "Could not reach the data feed." });
        }
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(id);
    };
  }, []);

  const tokens = useMemo(() => (feed && feed.ok ? feed.tokens : []), [feed]);
  const blips = useMemo(() => tokens.slice(0, 40).map(toBlip), [tokens]);
  const top = tokens.slice(0, 5);

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[520px]">
        <RadarSweep blips={blips} />
      </div>

      <div className="mx-auto mt-6 w-full max-w-[520px]" aria-live="polite">
        {feed === null && <p className="text-sm text-dim">Waiting for the first sweep.</p>}
        {feed && !feed.ok && (
          <p className="text-sm text-dim">
            Live tokens are unavailable right now. Radar retries every minute.
          </p>
        )}
        {feed && feed.ok && top.length === 0 && (
          <p className="text-sm text-dim">No Sui tokens in range yet. Radar retries every minute.</p>
        )}
        {top.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {top.map((t) => (
              <li key={t.address}>
                <Link
                  href={`/xray?ca=${encodeURIComponent(t.address)}`}
                  className="flex items-center justify-between gap-4 py-3 hover:bg-white/[0.03]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.symbol}</span>
                    <span className="block truncate text-sm text-dim">{t.name}</span>
                  </span>
                  <span className="num shrink-0 text-right text-sm">
                    <span className={`block ${toneClass(t.changeH1)}`}>{fmtPct(t.changeH1)}</span>
                    <span className="block text-dim">{fmtUsd(t.marketCap)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
