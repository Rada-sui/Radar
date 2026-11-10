import type { Metadata } from "next";
import { List, Prose, Section } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Radar shows data, not financial advice.",
};

export default function DisclaimerPage() {
  return (
    <Prose
      title="Disclaimer"
      intro="Radar shows data, not financial advice. Read this before you act on anything here."
      updated="10 November 2026"
    >
      <Section title="Not financial advice">
        <p>
          Nothing on Radar is a recommendation to buy, sell or hold any token. There are no price targets, no
          calls and no promised win rates. You decide, and you carry the risk.
        </p>
      </Section>

      <Section title="Small tokens are risky">
        <p>
          New and low-liquidity tokens can lose most or all of their value quickly, and prices can move sharply
          against a large sell. A token that passes every check can still fail.
        </p>
      </Section>

      <Section title="A ranking is history, not a forecast">
        <p>
          A wallet near the top of the leaderboard made money in the period Radar looked at. That does not mean
          it will again, and copying it does not give you its price, timing or position size.
        </p>
      </Section>

      <Section title="Limits of the data">
        <List
          items={[
            "Figures come from free third-party sources and can be late, partial or wrong.",
            "The leaderboard covers recent trades in the most active pools, not full wallet histories.",
            "One person can control many wallets, and some wallets are bots or services.",
          ]}
        />
      </Section>

      <Section title="No affiliation">
        <p>
          Radar is independent. It is not affiliated with or endorsed by Sui, Mysten Labs, GeckoTerminal or
          DexScreener. Those names belong to their owners.
        </p>
      </Section>
    </Prose>
  );
}
