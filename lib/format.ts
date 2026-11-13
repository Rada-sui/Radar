export function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs === 0) return "$0";
  return `$${n.toPrecision(3)}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
}

export function fmtAge(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "n/a";
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const h = minutes / 60;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** "5m ago", "3h ago", "2d ago" from a millisecond timestamp. */
export function fmtAgo(ts: number | null | undefined): string {
  if (ts == null || !Number.isFinite(ts)) return "n/a";
  const mins = Math.max(0, (Date.now() - ts) / 60_000);
  return `${fmtAge(mins)} ago`;
}

export function shortAddr(a: string, head = 6, tail = 4): string {
  if (a.length <= head + tail + 1) return a;
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

/** Colour class for a profit/loss figure. Neutral when zero or unknown. */
export function toneClass(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "text-dim";
  return n > 0 ? "text-gain" : "text-loss";
}

/** Display ROI without rounding small profitable differences down to 1.0x. */
export function fmtRoi(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "n/a";
  if (n >= 2) return `${n.toFixed(1)}x`;
  const rounded = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  // Do not make a genuinely profitable wallet look exactly breakeven because
  // display rounding erased the small difference above 1.0.
  return n > 1 && Number(rounded) <= 1 ? ">1x" : `${rounded}x`;
}
