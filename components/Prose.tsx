import type { ReactNode } from "react";

/** Long-form page: a readable measure, plain headings, no decoration. */
export function Prose({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-6xl px-5 pb-8 pt-28 sm:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-xl text-lg text-dim">{intro}</p>
      {updated && <p className="num mt-3 text-xs text-faint">Last updated {updated}</p>}
      <div className="mt-12 max-w-2xl space-y-12">{children}</div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-medium tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-dim [&_strong]:font-semibold [&_strong]:text-white">
        {children}
      </div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2.5 border-l border-line-strong pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
