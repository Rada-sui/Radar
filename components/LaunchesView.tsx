"use client";

import Link from "next/link";
import { fmtAge, fmtPct, fmtUsd, toneClass } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import type { RadarFeed, RadarToken } from "@/lib/types";
import { Notice, TableWrap } from "./ui";

/** Quick flags from list data alone. The full trap check lives on X-Ray. */
export function quickFlags(t: RadarToken): string[] {
  const flags: string[] = [];
  if (t.liquidityUsd !== null && t.marketCap && t.marketCap > 0 && t.liquidityUsd / t.marketCap < 0.05) {
    flags.push("Thin liquidity");
  }
  const buys = t.buysH1 ?? 0;
  const sells = t.sellsH1 ?? 0;
  if (buys + sells >= 20 && sells > buys * 1.5) flags.push("Sell heavy");
  if (t.volumeH1 !== null && t.volumeH1 < 500) flags.push("Little trading");
  return flags;
}

export default function LaunchesView() {
  const { data, error, loading, reload } = useFeed<RadarFeed>("/api/radar?view=new", 45_000);

  if (loading) return <p className="text-dim">Loading new pools.</p>;
  if (!data || !data.ok) {
    return (
      <Notice
        title="New launches could not be loaded."
        body={(data && !data.ok ? data.error : error) ?? "Try again in a minute."}
        action={{ label: "Try again", onClick: reload }}
      />
    );
  }
  if (data.tokens.length === 0) return <p className="text-dim">No new pools to show right now.</p>;

  return (
    <div>
      <TableWrap min={820}>
        <caption className="sr-only">Newly created Sui pools with quick checks</caption>
        <thead>
          <tr className="border-b border-line-strong text-sm text-faint">
            <th scope="col" className="py-3 pr-4 font-normal">Token</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Age</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Market cap</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Liquidity</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Volume 1h</th>
            <th scope="col" className="px-4 py-3 text-right font-normal">Change 1h</th>
            <th scope="col" className="py-3 pl-4 font-normal">Quick read</th>
          </tr>
        </thead>
        <tbody>
          {data.tokens.map((t) => {
            const flags = quickFlags(t);
            return (
              <tr key={t.address} className="border-b border-line transition-colors hover:bg-white/[0.03]">
                <td className="py-4 pr-4">
                  <Link href={`/xray?ca=${encodeURIComponent(t.address)}`} className="block">
                    <span className="block font-medium">{t.symbol}</span>
                    <span className="block max-w-[12rem] truncate text-sm text-dim">{t.name}</span>
                  </Link>
                </td>
                <td className="num px-4 py-4 text-right text-sm text-dim">{fmtAge(t.ageMinutes)}</td>
                <td className="num px-4 py-4 text-right text-sm">{fmtUsd(t.marketCap)}</td>
                <td className="num px-4 py-4 text-right text-sm text-dim">{fmtUsd(t.liquidityUsd)}</td>
                <td className="num px-4 py-4 text-right text-sm">{fmtUsd(t.volumeH1)}</td>
                <td className={`num px-4 py-4 text-right text-sm ${toneClass(t.changeH1)}`}>{fmtPct(t.changeH1)}</td>
                <td className="py-4 pl-4 text-sm text-dim">
                  {flags.length ? flags.join(", ") : "Nothing flagged"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faint">
        Quick read uses list data only. Select a token to run the full trap check: top-buyer share, buys against
        sells, and what the first buyers did next.
      </p>
      <p className="num mt-2 text-xs text-faint">
        Updated {new Date(data.updatedAt).toLocaleTimeString()}. Source: GeckoTerminal.
      </p>
    </div>
  );
}
