import type { Metadata } from "next";
import { Prose, Section } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Radar's privacy information.",
};

export default function PrivacyPage() {
  return (
    <Prose
      title="Privacy"
      intro="Radar is a read-only public-data app. This page explains what it does and does not collect."
      updated="10 November 2026"
    >
      <Section title="Data we use">
        <p>
          Radar reads public market and wallet data from third-party Sui data sources. When you search a token,
          the token type and the resulting request are used to retrieve that public data.
        </p>
      </Section>

      <Section title="Data we do not collect">
        <p>
          Radar does not ask for a wallet connection, private key, seed phrase or funds. It does not execute
          transactions or intentionally collect personal wallet information beyond public on-chain addresses.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          Market data requests go to the public GeckoTerminal and DexScreener APIs. Their own privacy policies
          and operational logs may apply to those requests.
        </p>
      </Section>

      <Section title="Changes">
        <p>We may update this page when the app or its data sources change.</p>
      </Section>
    </Prose>
  );
}
