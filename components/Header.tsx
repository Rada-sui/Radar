"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGAL_NAV, MAIN_NAV, RESOURCES_NAV } from "@/lib/nav";

export default function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Lock page scroll while the menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Escape closes; Tab stays inside the menu while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== "Tab" || !rootRef.current) return;
      const focusable = Array.from(
        rootRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
      ).filter((el) => el.offsetParent !== null || el === buttonRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href;

  return (
    <header ref={rootRef} className="fixed inset-x-0 top-0 z-50 border-b border-line-strong bg-black">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black from-60% to-transparent" />

      <div className="relative flex h-16 w-full items-center justify-between px-5 sm:px-6">
        <Link
          href="/"
          onClick={close}
          className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-white"
        >
          <Image src="/logo.png" alt="" width={32} height={32} preload className="h-8 w-8" />
          <span>Radar</span>
        </Link>

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="relative -mr-2 grid h-11 w-11 place-items-center rounded-full"
        >
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          <span
            aria-hidden
            className={`absolute block h-px w-6 bg-white transition-transform duration-300 ${
              open ? "translate-y-0 rotate-45" : "-translate-y-[5px]"
            }`}
          />
          <span
            aria-hidden
            className={`absolute block h-px w-6 bg-white transition-transform duration-300 ${
              open ? "translate-y-0 -rotate-45" : "translate-y-[5px]"
            }`}
          />
        </button>
      </div>

      <nav
        id="site-menu"
        aria-label="Main"
        inert={!open}
        className={`fixed inset-0 -z-10 overflow-y-auto bg-black transition-[clip-path] duration-700 ease-[cubic-bezier(0.7,0,0.2,1)] ${
          open
            ? "[clip-path:circle(150%_at_calc(100%-40px)_32px)]"
            : "[clip-path:circle(0px_at_calc(100%-40px)_32px)]"
        }`}
      >
        <div className="mx-auto grid min-h-full w-full max-w-6xl gap-12 px-5 pb-12 pt-28 sm:px-8 lg:grid-cols-[1.6fr_1fr]">
          <ul className="flex flex-col">
            {MAIN_NAV.map((item, i) => (
              <li
                key={item.href}
                className={`border-t border-line transition-all duration-500 ${
                  open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
                }`}
                style={{ transitionDelay: open ? `${180 + i * 60}ms` : "0ms" }}
              >
                <Link
                  href={item.href}
                  onClick={close}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className="group flex items-baseline justify-between gap-6 py-5"
                >
                  <span className="font-display text-3xl font-medium tracking-tight text-white transition-colors group-hover:text-white/70 sm:text-5xl">
                    {item.label}
                  </span>
                  <span className="hidden max-w-[16rem] text-right text-sm text-dim sm:block">
                    {item.blurb}
                  </span>
                </Link>
              </li>
            ))}
            <li className="border-t border-line" />
          </ul>

          <div
            className={`flex flex-col gap-10 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
            style={{ transitionDelay: open ? "420ms" : "0ms" }}
          >
            <div>
              <p className="mb-3 text-sm text-faint">Resources</p>
              <ul className="flex flex-col gap-2">
                {RESOURCES_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className="text-lg text-white/90 hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-sm text-faint">Legal</p>
              <ul className="flex flex-col gap-2">
                {LEGAL_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={close}
                      aria-current={isActive(item.href) ? "page" : undefined}
                      className="text-dim hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <p className="max-w-xs text-sm text-faint">
              Read-only. Radar never touches your funds or asks for a key.
            </p>
          </div>
        </div>
      </nav>
    </header>
  );
}
