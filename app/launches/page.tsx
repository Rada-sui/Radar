import type { Metadata } from "next";
import LaunchesView from "@/components/LaunchesView";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Launches",
  description: "Newly created Sui pools with a quick read on each.",
};

export default function LaunchesPage() {
  return (
    <PageShell
      title="Launches"
      intro="New Sui pools as they appear, with a quick read on liquidity and trading. Select one for the full check."
    >
      <LaunchesView />
    </PageShell>
  );
}
