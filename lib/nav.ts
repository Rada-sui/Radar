export type NavItem = { href: string; label: string; blurb: string };

export const MAIN_NAV: NavItem[] = [
  { href: "/radar", label: "Radar", blurb: "Market momentum and the tokens moving right now" },
  { href: "/xray", label: "X-Ray", blurb: "Scan any token for its earliest buyers" },
  { href: "/leaderboard", label: "Leaderboard", blurb: "Wallets ranked on profit actually taken out" },
  { href: "/launches", label: "Launches", blurb: "New tokens, checked as they appear" },
  { href: "/report", label: "Daily report", blurb: "Top runners, volume by exchange and the newest pools" },
  { href: "/dashboard", label: "Dashboard", blurb: "Radar, top wallets and launches in one view" },
];

export const RESOURCES_NAV: NavItem[] = [
  { href: "/docs", label: "Docs", blurb: "How Radar scores wallets and reads the chain" },
  { href: "/brand", label: "Brand", blurb: "Name, colours and type" },
];

export const LEGAL_NAV: NavItem[] = [
  { href: "/privacy", label: "Privacy", blurb: "" },
  { href: "/terms", label: "Terms", blurb: "" },
  { href: "/disclaimer", label: "Disclaimer", blurb: "" },
];
