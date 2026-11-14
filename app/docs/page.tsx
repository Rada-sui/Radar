import type { Metadata } from "next";
import { List, Prose, Section } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Radar reads the Sui chain, scores wallets and checks tokens.",
};

export default function DocsPage() {
  return (
    <Prose
      title="Docs"
      intro="How Radar gets its data, how it scores wallets, and what each check on a token means."
      updated="10 November 2026"
    >
      <Section title="Where the data comes from">
        <p>
          Radar reads public market data from <strong>GeckoTerminal</strong> and <strong>DexScreener</strong>.
          Both are free and rate limited, so Radar caches responses and refreshes about once a minute. It does
          not tick trade by trade.
        </p>
        <p>
          Radar is read-only. It never asks you to connect a wallet, sign anything or share a key.
        </p>
      </Section>

      <Section title="How wallet profit is counted">
        <p>
          Radar follows each wallet&apos;s buys and sells in order and keeps a running average cost for every
          token. When the wallet sells, only the part that matches earlier buys counts. Profit on that part is
          the sale proceeds minus the average cost of those tokens.
        </p>
        <p>
          X-Ray ranks profitable wallets for the pasted token from the visible last-24-hour trades. ROI is the
          matched sale proceeds divided by the average-cost basis of those sold tokens, shown as an x multiple.
        </p>
        <p>
          A later buy never changes profit that was already taken. A sell with no earlier buy in the data
          window books nothing, and the wallet is marked with a dagger so you can see part of its history is
          missing.
        </p>
      </Section>

      <Section title="The three ranking rules">
        <List
          items={[
            <span key="1">
              <strong>Only sold profit counts.</strong> Open positions never add to a wallet&apos;s profit or
              rank.
            </span>,
            <span key="2">
              <strong>Impossible figures are dropped.</strong> A wallet that appears to have realised more than
              it sold, or whose numbers are not valid, is left off the board.
            </span>,
            <span key="3">
              <strong>Recent form can only hurt.</strong> A loss in the last six hours lowers a score, by up to
              40%. A recent gain does nothing.
            </span>,
          ]}
        />
      </Section>

      <Section title="Score and tiers">
        <p>The score runs from 0 to 100 and has three parts:</p>
        <List
          items={[
            "Up to 60 points for realised profit, on a log scale. About $10,000 earns the full 60.",
            "Up to 25 points for win rate: the share of sold tokens that made money.",
            "Up to 15 points for evidence: the number of different tokens the wallet has sold, up to five.",
          ]}
        />
        <p>
          <strong>Diamond</strong> needs a score of 75 or more, a win rate of 60% or more, and at least three
          tokens sold. <strong>Gold</strong> needs 55 or more, 50% or more, and at least two tokens sold.
          Everything else on the board is <strong>Silver</strong>. One big win on one token cannot reach
          Diamond.
        </p>
      </Section>

      <Section title="Reading the trap check">
        <p>The checks on X-Ray run on the trades Radar could read for the token. Each shows Clear, Watch or Risk.</p>
        <List
          items={[
            <span key="a">
              <strong>Top-ten buyers.</strong> Watch above 55% of buy volume, Risk above 75%.
            </span>,
            <span key="b">
              <strong>Biggest single buyer.</strong> Watch above 15%, Risk above 30%.
            </span>,
            <span key="c">
              <strong>Buys against sells.</strong> Watch when sells are 1.25 times buys, Risk at 2 times.
            </span>,
            <span key="d">
              <strong>First 20 buyers.</strong> Shown only when Radar has the pool&apos;s full history. Watch
              when fewer than 30% still hold.
            </span>,
            <span key="e">
              <strong>Liquidity against market cap.</strong> Watch below 5%, Risk below 2%.
            </span>,
            <span key="f">
              <strong>Pool age and profile.</strong> Watch for pools under an hour old, and for tokens with no
              website or socials listed on DexScreener.
            </span>,
          ]}
        />
      </Section>

      <Section title="What Radar cannot see yet">
        <List
          items={[
            "The free trade feed returns each pool's latest 300 trades from the last 24 hours. For busy or older pools, buyers are the earliest in that window, not the first ever. X-Ray says which case applies.",
            "X-Ray uses Tide's token-wide 30-day trade history to find profitable wallet addresses beyond GeckoTerminal's limited free feed. Wallet performance is ranked on realised profit within that 30-day scan window.",
            "Wallets with more than 150 trades in a day are left out as likely bots or routers.",
            "Trades are attributed to the wallet that sent the transaction. One person can use many wallets.",
            "Bundled buys, sniper and insider share, and a dev's past launches need on-chain indexing that Radar does not do yet.",
          ]}
        />
      </Section>

      <Section title="What Radar is not">
        <p>
          Radar does not give price targets, calls or promised win rates. It shows what happened on-chain, and
          you decide. See the <a className="text-white underline underline-offset-4" href="/disclaimer">disclaimer</a>.
        </p>
      </Section>
    </Prose>
  );
}
