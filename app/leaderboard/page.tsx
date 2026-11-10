import type { Metadata } from "next";
import LeaderboardView from "@/components/LeaderboardView";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Sui wallets ranked on profit they actually took out.",
};

export default function LeaderboardPage() {
  return (
    <PageShell
      title="Leaderboard"
      intro="Wallets ranked on profit they have actually taken out, not gains that only exist on paper."
    >
      <LeaderboardView />
    </PageShell>
  );
}
