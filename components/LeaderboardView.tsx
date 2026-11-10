"use client";

import { fmtAgo, fmtUsd, shortAddr, toneClass } from "@/lib/format";
import { explorerAccount } from "@/lib/sui";
import { useFeed } from "@/lib/useFeed";
import type { LeaderResponse, LeaderRow, Tier } from "@/lib/types";
import { Notice, TableWrap } from "./ui";

const TIER_CLS: Record<Tier, string> = {
  Diamond: "border-white text-white",
  Gold: "border-white/60 text-white/90",
  Silver: "border-white/25 text-dim",
};

export default function LeaderboardView() {
  const { data, error, loading, reload } = useFeed<LeaderResponse>("/api/leaderboard", 120_000);

  if (loading) {
    return (
      <p className="text-dim" aria-live="polite">
        Reading trades from the most active pools. The first load can take several seconds.
      </p>
    );
  }
  if (!data || !data.ok) {
    return (
      <Notice
        title="The board could not be built."
        body={(data && !data.ok ? data.error : error) ?? "Try again in a minute."}
        action={{ label: "Try again", onClick: reload }}
      />
    );
  }

  const { board } = data;
  const s = board.scan;
  return (
    <div>
      <div className="border border-line p-5 text-sm leading-relaxed text-dim">
        <p>
          Built from <span className="num text-white">{s.trades}</span> trades across{" "}
          <span className="num text-white">{s.pools}</span> of the most active Sui pools over the last{" "}
          {s.windowHours} hours, covering <span className="num text-white">{s.wallets}</span> wallets. The free
          trade feed shows each pool&apos;s latest 300 trades, so this is a snapshot of recent activity, not a
          wallet&apos;s lifetime record.
          {s.poolsFailed > 0 && ` ${s.poolsFailed} pools could not be read this time.`}
        </p>
        <p className="mt-2">
          Left out: {s.droppedBots} likely bots (over 150 trades in a day) and {s.droppedInconsistent} wallets
          whose figures did not add up.
        </p>
      </div>

      {board.rows.length === 0 ? (
        <p className="mt-10 text-dim">
          No wallet has realised a profit in this window yet. Check back as more trades come in.
        </p>
      ) : (
        <div className="mt-8">
          <Table rows={board.rows} recentHours={s.recentHours} />
        </div>
      )}

      <p className="num mt-4 text-xs text-faint">
        Updated {new Date(board.updatedAt).toLocaleTimeString()}. Refreshes about every ten minutes.
      </p>
    </div>
  );
}

function Table({ rows, recentHours }: { rows: LeaderRow[]; recentHours: number }) {
  return (
    <TableWrap min={860}>
      <caption className="sr-only">Wallets ranked by score</caption>
      <thead>
        <tr className="border-b border-line-strong text-sm text-faint">
          <th scope="col" className="py-3 pr-3 font-normal">Rank</th>
          <th scope="col" className="px-3 py-3 font-normal">Wallet</th>
          <th scope="col" className="px-3 py-3 font-normal">Tier</th>
          <th scope="col" className="px-3 py-3 text-right font-normal">Score</th>
          <th scope="col" className="px-3 py-3 text-right font-normal">Realised profit</th>
          <th scope="col" className="px-3 py-3 text-right font-normal">Last {recentHours}h</th>
          <th scope="col" className="px-3 py-3 text-right font-normal">Win rate</th>
          <th scope="col" className="px-3 py-3 text-right font-normal">Tokens sold</th>
          <th scope="col" className="py-3 pl-3 text-right font-normal">Last trade</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.address} className="border-b border-line transition-colors hover:bg-white/[0.03]">
            <td className="num py-3.5 pr-3 text-sm text-dim">{i + 1}</td>
            <td className="num px-3 py-3.5 text-sm">
              <a
                href={explorerAccount(r.address)}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-white/30 underline-offset-4 hover:decoration-white"
              >
                {shortAddr(r.address, 6, 4)}
              </a>
            </td>
            <td className="px-3 py-3.5">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TIER_CLS[r.tier]}`}>
                {r.tier}
              </span>
            </td>
            <td className="num px-3 py-3.5 text-right text-sm">{r.score}</td>
            <td className={`num px-3 py-3.5 text-right text-sm ${toneClass(r.realisedUsd)}`}>
              +{fmtUsd(r.realisedUsd)}
              {r.partial && <span title="Sold tokens bought before this data window"> †</span>}
            </td>
            <td className={`num px-3 py-3.5 text-right text-sm ${toneClass(r.recentRealisedUsd)}`}>
              {r.recentRealisedUsd === 0
                ? "0"
                : `${r.recentRealisedUsd > 0 ? "+" : "-"}${fmtUsd(Math.abs(r.recentRealisedUsd))}`}
            </td>
            <td className="num px-3 py-3.5 text-right text-sm">{Math.round(r.winRate * 100)}%</td>
            <td className="num px-3 py-3.5 text-right text-sm text-dim">{r.tokensClosed}</td>
            <td className="py-3.5 pl-3 text-right text-sm text-dim">{fmtAgo(r.lastActiveAt)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={9} className="pt-4 text-xs leading-relaxed text-faint">
            Profit is realised only: the sold part of a position against the wallet&apos;s average buy price.
            A dagger marks a wallet that also sold tokens bought before this window; only the part with a known
            buy is counted. A loss in the recent window lowers a score. A recent gain does not raise it.
          </td>
        </tr>
      </tfoot>
    </TableWrap>
  );
}
