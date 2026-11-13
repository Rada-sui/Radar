"use client";
import { useState } from "react";
import { fmtAge, fmtPct, fmtUsd, shortAddr } from "@/lib/format";
import { explorerAccount } from "@/lib/sui";
import { useFeed } from "@/lib/useFeed";
import type { LeaderResponse, LeaderRow, Tier } from "@/lib/types";
import { Notice, ShowCount } from "./ui";

const TIER_CLS: Record<Tier, string> = { Diamond: "border-white text-white", Gold: "border-white/60 text-white/90", Silver: "border-white/25 text-dim" };

export default function LeaderboardView() {
  const { data, error, loading, reload } = useFeed<LeaderResponse>("/api/leaderboard", 120_000);
  const [show, setShow] = useState(10);
  if (loading) return <p className="text-dim" aria-live="polite">Reading trades from the most active pools. The first load can take several seconds.</p>;
  if (!data || !data.ok) return <Notice title="The board could not be built." body={(data && !data.ok ? data.error : error) ?? "Try again in a minute."} action={{ label: "Try again", onClick: reload }} />;
  const { board } = data;
  return <div>
    <div className="border border-line p-5 text-sm leading-relaxed text-dim">
      <div className="mb-5 grid grid-cols-2 gap-4 border-b border-line pb-5"><div><div className="text-xs uppercase tracking-[0.16em] text-faint">Total tracked</div><div className="num mt-1 text-xl text-white">{board.scan.wallets}</div></div><div><div className="text-xs uppercase tracking-[0.16em] text-faint">Updated</div><div className="num mt-1 text-xl text-white">{new Date(board.updatedAt).toLocaleTimeString()}</div></div></div>
      {board.scan.basis === "lifetime" && board.scan.tide ? <p className="mb-2 text-white">Ranked on realised profit across each wallet&apos;s whole trading history, from Tide. Only wallets that were profitable in the last {board.scan.windowHours} hours are considered, and {board.scan.tide.answered} of {board.scan.tide.candidates} were checked.{board.scan.tide.incomplete > 0 && ` ${board.scan.tide.incomplete} could not be read in full and are marked partial.`}</p> : <p className="mb-2 text-white">Ranked on realised profit in the last {board.scan.windowHours} hours only.</p>}
      <p>Wallets found in <span className="num text-white">{board.scan.trades}</span> recent trades. Scanned <span className="num text-white">{board.scan.pools}</span> of <span className="num text-white">{board.scan.poolsTotal}</span> candidate pools over the last {board.scan.windowHours} hours. {board.scan.poolsSkipped > 0 && `${board.scan.poolsSkipped} skipped.`} {board.scan.poolsFailed > 0 && `${board.scan.poolsFailed} failed to load.`}</p>
      <p className="mt-2">Left out: {board.scan.droppedBots} likely bots and {board.scan.droppedInconsistent} wallets whose figures did not add up.</p>
    </div>
    {board.rows.length === 0 ? <p className="mt-10 text-dim">No wallet has realised a profit in this window yet.</p> : <div className="mt-8"><div className="mb-4"><ShowCount count={board.rows.length} value={show} onChange={setShow} /></div><div className="space-y-2">{board.rows.slice(0, show).map((row, i) => <WalletRow key={row.address} row={row} rank={i + 1} />)}</div></div>}
  </div>;
}

function WalletRow({ row: r, rank }: { row: LeaderRow; rank: number }) {
  const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(r.address); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  const basis = r.soldUsd - r.realisedUsd; const returnPct = basis > 0 ? (r.realisedUsd / basis) * 100 : null; const hold = r.firstBuyAt !== null && r.lastSellAt !== null ? fmtAge((r.lastSellAt - r.firstBuyAt) / 60000) : "n/a";
  return <div className="border border-line"><button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full cursor-pointer items-center gap-3 p-4 text-left hover:bg-white/[0.03]"><span className="num w-6 text-sm text-faint">{rank}</span><span className="num min-w-0 flex-1 truncate text-sm">{shortAddr(r.address, 4, 4)}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_CLS[r.tier]}`}>{r.tier}</span><span className="num text-sm text-white">{r.score}</span><span aria-hidden>{open ? "⌃" : "⌄"}</span></button>
    {open && <div className="grid gap-3 border-t border-line p-4 text-sm sm:grid-cols-2"><div className="flex flex-wrap items-center gap-3 sm:col-span-2"><span className="num break-all">{r.address}</span><button type="button" onClick={copy} className="cursor-pointer border border-line px-2 py-1 text-xs">{copied ? "Copied" : "Copy"}</button><a className="underline" href={explorerAccount(r.address)} target="_blank" rel="noreferrer">View on Suiscan</a></div><Detail label="Wins" value={`${r.wins} / ${r.soldTokens}`} /><Detail label="Win rate" value={`${Math.round(r.winRate * 100)}%${r.soldTokens === 1 ? " · limited history" : ""}`} />{r.basis === "lifetime" ? <><Detail label="Realised P&L, all time" value={`+${fmtUsd(r.realisedUsd)}`} /><Detail label="Realised P&L, last 24h" value={`${(r.realised24hUsd ?? 0) >= 0 ? "+" : ""}${fmtUsd(r.realised24hUsd ?? 0)}`} /><Detail label="Tokens traded" value={String(r.tokensTraded)} />{r.partial && <Detail label="History" value="Partial" />}</> : <><Detail label="Return" value={fmtPct(returnPct)} /><Detail label="Realised P&L" value={`+${fmtUsd(r.realisedUsd)}`} /><Detail label="Trades per day" value={String(r.trades)} /><Detail label="Avg hold" value={hold} /></>}</div>}
  </div>;
}
function Detail({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-faint">{label}</div><div className="num mt-1 text-white">{value}</div></div>; }
