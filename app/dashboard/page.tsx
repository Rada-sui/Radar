import type { Metadata } from "next";
import DashboardView from "@/components/DashboardView";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Market momentum, top wallets, trending tokens and new launches in one view.",
};

export default function DashboardPage() {
  return (
    <PageShell title="Dashboard" intro="Market momentum, top wallets, trending tokens and new launches in one view.">
      <DashboardView />
    </PageShell>
  );
}
