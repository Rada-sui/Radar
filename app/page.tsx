import Link from "next/link";
import LiveRadar from "@/components/LiveRadar";
import Reveal from "@/components/Reveal";

const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8";

const RULES = [
  {
    title: "Only sold profit counts",
    body: "A position that has not been sold earns nothing. Open positions are valued at what they are worth now, not at the best the chart ever looked.",
  },
  {
    title: "Numbers that do not add up are dropped",
    body: "If a wallet reports more profit than it ever sold, Radar leaves it unranked instead of choosing the more flattering figure.",
  },
  {
    title: "A bad stretch hurts more than a good one helps",
    body: "A strong few hours is too small a sample to trust, so it cannot lift a score. A weak stretch can pull it down.",
  },
];

const MODULES = [
  {
    href: "/xray",
    title: "Token X-Ray",
    body: "Paste any Sui token to see its earliest buyers, what each one took out, and how often they get it right.",
  },
  {
    href: "/leaderboard",
    title: "Wallet leaderboard",
    body: "Wallets graded Diamond, Gold and Silver on realised profit, win rate and how much evidence backs the record, from the latest day of trading in the most active pools.",
  },
  {
    href: "/launches",
    title: "Launch checks",
    body: "New pools with a quick read on liquidity and trading, then a full check: how concentrated the buyers are, buys against sells, and what the first 20 buyers did next.",
  },
  {
    href: "/report",
    title: "Daily report",
    body: "The day's top runners, where volume is trading, and the newest pools.",
  },
  {
    href: "/radar",
    title: "Radar",
    body: "Market momentum and the Sui tokens trending right now, with age, market cap and volume over the last hour.",
  },
];

const FAQ = [
  {
    q: "Where does the data come from?",
    a: "Radar reads Sui on-chain activity and public market data from DexScreener and GeckoTerminal. Both are free sources with rate limits, so figures refresh about once a minute rather than tick by tick.",
  },
  {
    q: "What makes a wallet rank highly?",
    a: "Realised profit, how consistently it wins, and how much evidence sits behind that record. A loss in the most recent hours lowers a score. A recent gain does not raise it. Unsold gains never buy a rank.",
  },
  {
    q: "Do I need to connect a wallet?",
    a: "No. Radar is read-only. It never touches your funds or asks for a key. You watch what other wallets do and decide for yourself.",
  },
  {
    q: "What does it cost?",
    a: "Everything on Radar is free right now.",
  },
  {
    q: "Is this a calls channel?",
    a: "No. There are no price targets and no promised win rates. Radar shows what happened on-chain, and you decide, size and manage your own risk. Data, not financial advice.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-5 pb-20 pt-32 text-center sm:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="font-display text-[clamp(2rem,4.6vw,3.6rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
            Know which Sui wallets keep their profits, and who got in early.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-dim sm:text-lg">
            Smart money tracking on the web, with wallets ranked on profit actually taken out. Sui,
            read-only, and free.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-white/85"
            >
              Open the dashboard
            </Link>
            <Link
              href="/xray"
              className="rounded-full border border-line-strong px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-white"
            >
              Scan a token
            </Link>
          </div>
        </div>
      </section>

      {/* Facts band */}
      <section className="border-y border-line bg-panel">
        <dl className="mx-auto grid max-w-3xl grid-cols-3 gap-6 px-5 py-14 text-center sm:px-8">
          {[
            ["Free", "no plan, no paywall"],
            ["0", "wallets to connect"],
            ["1 min", "data refresh"],
          ].map(([big, small]) => (
            <div key={big}>
              <dt className="num text-3xl font-semibold text-white sm:text-5xl">{big}</dt>
              <dd className="mt-2 text-xs text-dim sm:text-sm">{small}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Live radar */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="text-center font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Live on Sui right now.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-dim">
            Every blip is a trending token. The sweep lights it up as it passes.
          </p>
          <div className="mx-auto mt-10 max-w-xl">
            <LiveRadar />
          </div>
        </Reveal>
      </section>

      {/* Scanner */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Paste a token. See who was early.
          </h2>
          <p className="mt-4 max-w-xl text-dim">
            Every wallet that bought before the move, what it took out, and how often it gets this
            right. Free, with no account and no wallet connected.
          </p>
          <form action="/xray" method="get" className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <label htmlFor="ca" className="sr-only">
              Token address or coin type
            </label>
            <input
              id="ca"
              name="ca"
              required
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…::module::TOKEN"
              className="num min-w-0 flex-1 rounded-full border border-line-strong bg-panel px-5 py-3.5 text-sm text-white placeholder:text-faint focus:border-white focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/85"
            >
              Scan token
            </button>
          </form>
        </Reveal>
      </section>

      {/* Ranking rules */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Ranked on money taken out.
          </h2>
          <p className="mt-4 max-w-xl text-dim">
            A wallet that is up on paper has proved nothing. Radar scores profit it has actually
            realised, under three rules.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {RULES.map((r, i) => (
            <Reveal key={r.title} delay={i * 0.12}>
              <div className="border-t border-line-strong pt-6">
                <h3 className="text-lg font-semibold leading-snug">{r.title}</h3>
                <p className="mt-3 leading-relaxed text-dim">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            What you can do here.
          </h2>
        </Reveal>
        <ul className="mt-10 border-b border-line">
          {MODULES.map((m, i) => (
            <li key={m.title}>
              <Reveal delay={i * 0.06}>
                <Link
                  href={m.href}
                  className="group grid gap-2 border-t border-line py-7 md:grid-cols-[1fr_1.4fr] md:gap-10"
                >
                  <span className="font-display text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1">
                    {m.title}
                  </span>
                  <span className="leading-relaxed text-dim transition-colors group-hover:text-white/80">
                    {m.body}
                  </span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
            A few things worth knowing.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-10 max-w-3xl border-b border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden
                    className="num text-xl text-dim transition-transform duration-300 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-6 leading-relaxed text-dim">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Closing call */}
      <section className={`${wrap} py-24`}>
        <Reveal>
          <h2 className="max-w-2xl font-display text-3xl font-medium tracking-tight sm:text-5xl">
            Start with a token you already hold.
          </h2>
          <Link
            href="/xray"
            className="mt-8 inline-block rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-black transition-colors hover:bg-white/85"
          >
            Scan a token
          </Link>
        </Reveal>
      </section>
    </>
  );
}
