import type { Metadata } from "next";
import { Suspense } from "react";
import XRayView from "@/components/XRayView";

export const metadata: Metadata = {
  title: "X-Ray",
  description: "Paste any Sui token to see who bought early and what they did next.",
};

export default function XRayPage() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-8 pt-28 sm:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">X-Ray</h1>
      <p className="mt-4 max-w-xl text-dim">
        Paste a token to see its earliest buyers, what each one took out, and what to watch before you buy.
      </p>
      <div className="mt-10">
        <Suspense fallback={<p className="text-dim">Loading scanner.</p>}>
          <XRayView />
        </Suspense>
      </div>
    </section>
  );
}
