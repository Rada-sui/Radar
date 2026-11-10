"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Delay in seconds, for staggering siblings. */
  delay?: number;
};

/**
 * Draws a module in when it scrolls into view: a scan line sweeps down the
 * block and uncovers it. Content stays visible if JavaScript is unavailable
 * (the hidden state only applies under html.js).
 */
export default function Reveal({ children, className, delay = 0 }: Props) {
  // The outer element is observed; the inner one carries the clip-path.
  // Chrome applies an element's own clip-path when computing intersection,
  // so observing the clipped element itself would never fire.
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    if (!("IntersectionObserver" in window)) {
      inner.setAttribute("data-in", "");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          inner.setAttribute("data-in", "");
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(outer);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={outerRef} className={className}>
      <div ref={innerRef} data-reveal style={{ "--d": `${delay}s` } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}
