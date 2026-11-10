import type { Metadata } from "next";
import { List, Prose, Section } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Radar.",
};

export default function TermsPage() {
  return (
    <Prose
      title="Terms"
      intro="Plain terms for using Radar. By using the site you agree to them."
      updated="10 November 2026"
    >
      <Section title="What Radar is">
        <p>
          Radar is a free, read-only tool that shows public Sui market and wallet data. It does not hold funds,
          execute trades or give advice.
        </p>
      </Section>

      <Section title="Using Radar">
        <p>You agree not to:</p>
        <List
          items={[
            "Send automated or high-volume requests that strain the service or the free data sources behind it.",
            "Try to break, probe or get around the service's limits or security.",
            "Use Radar to harass anyone or to mislead others about what its data shows.",
          ]}
        />
      </Section>

      <Section title="Data and accuracy">
        <p>
          Radar&apos;s figures come from third-party sources and may be delayed, incomplete or wrong. Radar tries to
          say when its coverage is partial, but it does not promise that any figure is accurate or current.
        </p>
      </Section>

      <Section title="No warranty and limits on liability">
        <p>
          Radar is provided as it is, without warranties of any kind. To the extent the law allows, its
          operators are not liable for losses that follow from using it, including trading losses.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms may change. The date at the top shows when they last did. Using Radar after a change
          means you accept the new terms.
        </p>
      </Section>
    </Prose>
  );
}
