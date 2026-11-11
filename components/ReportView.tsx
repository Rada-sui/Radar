"use client";

import Link from "next/link";
import { fmtAge, fmtPct, fmtUsd, toneClass } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import type { ReportResponse } from "@/lib/types";
import { Notice, SectionTitle, Stat, TableWrap } from "./ui";

export default function ReportView() {
  const { data, error, loading, reload } = useFeed<ReportResponse>("/api/report", 180_000);

  if (loading) return <p className="text-dim">Building the report.</p>;
  if (!data || !data.ok) {
    return (
      <Notice
        title="The report could not be built."
        body={(data && !data.ok ? data.error : error) ?? "Try again in a minute."}
        action={{ label: "Try again", onClick: reload }}
      />
    );
  }
  const r = data.report;

  return (
    <div className="space-y-14">
      <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3">
        <Stat label="Pools read" value={String(r.totals.pools)} />
        <Stat label="Volume, 24 hours" value={fmtUsd(r.totals.volumeH24)} />
        <Stat label="Liquidity" value={fmtUsd(r.totals.liquidity)} />
      </dl>

      <section>
        <SectionTitle>Top runners, 24 hours</SectionTitle>
        <p className="mt-2 text-sm text-dim">Pools with at least $5K of liquidity, ranked by price change.</p>
        {r.runners.length === 0 ? (
          <p className="mt-6 text-dim">No pools met the liquidity bar.</p>
        ) : (
          <div className="mt-5">
            <TableWrap min={620}>
              <caption className="sr-only">Top runners over 24 hours</caption>
              <thead>
                <tr className="border-b border-line-strong text-sm text-faint">
                  <th scope="col" className="py-3 pr-4 font-normal">Token</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Change 24h</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Market cap</th>
                  <th scope="col" className="px-4 py-3 text-right font-normal">Liquidity</th>
                  <th scope="col" className="py-3 pl-4 text-right font-normal">Age</th>
                </tr>
              </thead>
              <tbody>
                {r.runners.map((t) => (
                  <tr key={t.address} className="border-b border-line hover:bg-white/[0.03]">
                    <td className="py-3.5 pr-4">
                      <Link href={`/xray?ca=${encodeURIComponent(t.address)}`} className="font-medium">
                        {t.symbol}
                      </Link>
                    </td>
                    <td className={`num px-4 py-3.5 text-right text-sm ${toneClass(t.changeH24)}`}>
                      {fmtPct(t.changeH24)}
                    </td>
                    <td className="num px-4 py-3.5 text-right text-sm">{fmtUsd(t.marketCap)}</td>
                    <td className="num px-4 py-3.5 text-right text-sm text-dim">{fmtUsd(t.liquidityUsd)}</td>
                    <td className="num py-3.5 pl-4 text-right text-sm text-dim">{fmtAge(t.ageMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Volume by exchange</SectionTitle>
        <ul className="mt-5 border-b border-line">
          {r.dexes.map((d) => (
            <li key={d.dex} className="flex items-baseline justify-between gap-4 border-t border-line py-3.5">
              <span className="capitalize">{d.dex.replace(/[-_]/g, " ")}</span>
              <span className="num text-sm">
                {fmtUsd(d.volumeH24)} <span className="text-dim">across {d.pools} pools</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <SectionTitle>Newest pools</SectionTitle>
        <ul className="mt-5 border-b border-line">
          {r.newest.map((t) => (
            <li key={t.address} className="border-t border-line">
              <Link
                href={`/xray?ca=${encodeURIComponent(t.address)}`}
                className="flex items-baseline justify-between gap-4 py-3.5 hover:bg-white/[0.03]"
              >
                <span className="font-medium">{t.symbol}</span>
                <span className="num text-sm text-dim">
                  {fmtAge(t.ageMinutes)} old, {fmtUsd(t.marketCap)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="max-w-2xl text-sm leading-relaxed text-faint">
        This report describes the pools Radar reads from GeckoTerminal (top volume, trending and new), not every
        pool on Sui. Updated {new Date(r.updatedAt).toLocaleTimeString()}.
      </p>
    </div>
  );
}
