import type { Metadata } from "next";
import RadarBoard from "@/components/RadarBoard";

export const metadata: Metadata = {
  title: "Radar",
  description: "Market momentum and the Sui tokens moving right now.",
};

export default function RadarPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-8 pt-28 sm:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Radar</h1>
      <p className="mt-4 max-w-xl text-dim">
        How the Sui market is moving right now, and which tokens are behind it.
      </p>
      <div className="mt-10">
        <RadarBoard />
      </div>
    </section>
  );
}
