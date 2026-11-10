"use client";

import Link from "next/link";
import { fmtAge, fmtPct, fmtUsd, shortAddr, toneClass } from "@/lib/format";
import { useFeed } from "@/lib/useFeed";
import type { LeaderResponse, RadarFeed, RadarToken } from "@/lib/types";
import { SectionTitle } from "./ui";

export default function DashboardView() {
  const trending = useFeed<RadarFeed>("/api/radar?view=trending", 60_000);
  const fresh = useFeed<RadarFeed>("/api/radar?view=new", 60_000);
  const board = useFeed<LeaderResponse>("/api/leaderboard", 120_000);

  const trendingOk = trending.data && trending.data.ok ? trending.data : null;
  const freshOk = fresh.data && fresh.data.ok ? fresh.data : null;
  const boardOk = board.data && board.data.ok ? board.data.board : null;
  const momentum = trendingOk?.momentum ?? null;

  return (
    <div className="grid gap-x-12 gap-y-14 lg:grid-cols-2">
      <Panel title="Market momentum" href="/radar" cta="Open Radar">
        {trending.loading ? (
          <Loading />
        ) : momentum ? (
          <div>
            <p className="font-display text-4xl font-semibold tracking-tight">{momentum.label}</p>
            <p className="num mt-2 text-dim">{momentum.score} out of 100</p>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-dim">
              {momentum.positiveShare !== null &&
                `${Math.round(momentum.positiveShare * 100)}% of trending tokens are up over the last hour. `}
              {momentum.buyShare !== null && `${Math.round(momentum.buyShare * 100)}% of their trades were buys.`}
            </p>
          </div>
        ) : (
          <Empty text="No momentum reading right now." />
        )}
      </Panel>

      <Panel title="Top wallets" href="/leaderboard" cta="Full leaderboard">
        {board.loading ? (
          <Loading text="Building the wallet board." />
        ) : boardOk && boardOk.rows.length > 0 ? (
          <ul className="divide-y divide-line border-y border-line">
            {boardOk.rows.slice(0, 5).map((r) => (
              <li key={r.address} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  <span className="num block text-sm">{shortAddr(r.address, 6, 4)}</span>
                  <span className="block text-sm text-dim">
                    {r.tier}, {Math.round(r.winRate * 100)}% win rate
                  </span>
                </span>
                <span className={`num shrink-0 text-sm ${toneClass(r.realisedUsd)}`}>+{fmtUsd(r.realisedUsd)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text="No wallet board yet. It builds from recent trades and can take a moment." />
        )}
      </Panel>

      <Panel title="Trending" href="/radar" cta="See all">
        {trending.loading ? <Loading /> : <TokenList tokens={trendingOk?.tokens.slice(0, 6) ?? []} />}
      </Panel>

      <Panel title="New launches" href="/launches" cta="Check launches">
        {fresh.loading ? <Loading /> : <TokenList tokens={freshOk?.tokens.slice(0, 6) ?? []} showAge />}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  href,
  cta,
  children,
}: {
  title: string;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <SectionTitle>{title}</SectionTitle>
        <Link href={href} className="text-sm text-dim underline underline-offset-4 hover:text-white">
          {cta}
        </Link>
      </div>
      {children}
    </section>
  );
}

const Loading = ({ text = "Loading." }: { text?: string }) => <p className="text-dim">{text}</p>;
const Empty = ({ text }: { text: string }) => <p className="max-w-sm text-sm leading-relaxed text-dim">{text}</p>;

function TokenList({ tokens, showAge }: { tokens: RadarToken[]; showAge?: boolean }) {
  if (tokens.length === 0) return <Empty text="Nothing to show right now." />;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {tokens.map((t) => (
        <li key={t.address}>
          <Link
            href={`/xray?ca=${encodeURIComponent(t.address)}`}
            className="flex items-center justify-between gap-4 py-3 hover:bg-white/[0.03]"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{t.symbol}</span>
              <span className="block truncate text-sm text-dim">
                {showAge ? `${fmtAge(t.ageMinutes)} old` : t.name}
              </span>
            </span>
            <span className="num shrink-0 text-right text-sm">
              <span className={`block ${toneClass(t.changeH1)}`}>{fmtPct(t.changeH1)}</span>
              <span className="block text-dim">{fmtUsd(t.marketCap)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
