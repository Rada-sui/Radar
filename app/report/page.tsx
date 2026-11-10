import type { Metadata } from "next";
import ReportView from "@/components/ReportView";
import { PageShell } from "@/components/ui";

export const metadata: Metadata = {
  title: "Daily report",
  description: "Daily Sui market runners, exchange volume and newest pools.",
};

export default function ReportPage() {
  return (
    <PageShell
      title="Daily report"
      intro="A daily read of the strongest runners, exchange volume and newest Sui pools."
    >
      <ReportView />
    </PageShell>
  );
}
