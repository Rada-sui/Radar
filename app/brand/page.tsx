import type { Metadata } from "next";
import Image from "next/image";
import { Prose, Section } from "@/components/Prose";

export const metadata: Metadata = {
  title: "Brand",
  description: "Radar's name, colours and type.",
};

const SWATCHES = [
  { name: "Black", hex: "#000000", use: "Page background" },
  { name: "Panel", hex: "#0B0B0B", use: "Inputs and raised areas" },
  { name: "White", hex: "#F5F5F5", use: "Text and primary buttons" },
  { name: "Grey", hex: "#9A9A9A", use: "Secondary text" },
  { name: "Gain", hex: "#3DDC97", use: "Profit figures only" },
  { name: "Loss", hex: "#FF5C5C", use: "Loss figures only" },
];

export default function BrandPage() {
  return (
    <Prose title="Brand" intro="The basics: the logo, the name, the colours and the type.">
      <Section title="Logo">
        <p>
          A droplet holding a radar scope, with a sweep and two blips. It sits beside the wordmark in the
          header. Use it white on black.
        </p>
        <div className="flex flex-wrap items-center gap-8 pt-4">
          <span className="flex h-40 w-40 items-center justify-center border border-line bg-black">
            <Image src="/logo.png" alt="Radar logo" width={112} height={112} />
          </span>
          <span className="flex items-center gap-3 font-display text-3xl font-semibold tracking-tight text-white">
            <Image src="/logo.png" alt="" width={44} height={44} />
            Radar
          </span>
        </div>
      </Section>

      <Section title="Name">
        <p>
          The name is <strong>Radar</strong>, set as plain text in Unbounded.
        </p>
        <p className="pt-4 font-display text-5xl font-semibold tracking-tight text-white">Radar</p>
      </Section>

      <Section title="Colour">
        <p>
          Radar is black, grey and white. Green and red appear only on profit and loss figures, so they keep
          their meaning.
        </p>
        <ul className="grid gap-px overflow-hidden border border-line bg-line sm:grid-cols-2">
          {SWATCHES.map((s) => (
            <li key={s.name} className="flex items-center gap-4 bg-black p-4">
              <span
                aria-hidden
                className="h-12 w-12 shrink-0 border border-line-strong"
                style={{ background: s.hex }}
              />
              <span>
                <span className="block text-white">{s.name}</span>
                <span className="num block text-sm">{s.hex}</span>
                <span className="block text-sm">{s.use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <p>
          <strong>Unbounded</strong> for headings. <strong>Hanken Grotesk</strong> for body text.{" "}
          <strong>JetBrains Mono</strong> for every number, so columns line up.
        </p>
      </Section>
    </Prose>
  );
}
