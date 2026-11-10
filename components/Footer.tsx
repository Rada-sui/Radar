import Link from "next/link";
import { LEGAL_NAV, MAIN_NAV, RESOURCES_NAV } from "@/lib/nav";

export default function Footer() {
  return (
    <footer className="mt-32 border-t border-line">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-xl font-semibold tracking-tight">Radar</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-dim">
            Wallet intelligence for Sui. See who stays profitable, and what you are buying into.
          </p>
        </div>
        <FooterList title="Product" items={MAIN_NAV} />
        <FooterList title="Resources" items={RESOURCES_NAV} />
        <FooterList title="Legal" items={LEGAL_NAV} />
      </div>
      <div className="mx-auto w-full max-w-6xl border-t border-line px-5 py-6 text-sm text-faint sm:px-8">
        Read-only. Radar never touches your funds or asks for a key. Data, not financial advice.
      </div>
    </footer>
  );
}

function FooterList({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="mb-4 text-sm text-faint">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-sm text-dim hover:text-white">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
