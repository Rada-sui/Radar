import type { Metadata } from "next";
import LaunchesView from "@/components/LaunchesView";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Launches",
  description: "Sui tokens whose packages were published within the last 24 hours with a quick read on each.",
};

export default function LaunchesPage() {
  return (
    <PageShell
      title="Launches"
      intro="Sui tokens whose packages were published within the last 24 hours, with a quick read on liquidity and trading. Select one for the full check."
    >
      <LaunchesView />
    </PageShell>
  );
}
