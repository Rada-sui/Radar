import type { ReactNode } from "react";

export function PageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pb-8 pt-28 sm:px-8">
      <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-4 max-w-xl text-dim">{intro}</p>
      <div className="mt-10">{children}</div>
    </section>
  );
}

export function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="max-w-2xl border border-line-strong p-6">
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-dim">{body}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-white"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-sm text-faint">{label}</dt>
      <dd className={`num mt-1 text-lg ${tone ?? "text-white"}`}>{value}</dd>
    </div>
  );
}

export function TableWrap({ children, min = 680 }: { children: ReactNode; min?: number }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full border-collapse text-left" style={{ minWidth: min }}>
        {children}
      </table>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-xl font-medium tracking-tight">{children}</h2>;
}
