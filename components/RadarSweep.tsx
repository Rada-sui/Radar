"use client";

import { useEffect, useRef } from "react";

export type Blip = {
  id: string;
  /** Radians, 0 = east, clockwise. */
  angle: number;
  /** 0 (centre) to 1 (outer ring). */
  radius: number;
};

const TAU = Math.PI * 2;

/**
 * Decorative radar sweep drawn on a canvas. Tokens show up as blips that
 * flare when the sweep passes them. The data is also listed as text next to
 * the canvas, so this layer is hidden from assistive tech.
 */
export default function RadarSweep({ blips }: { blips: Blip[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blipsRef = useRef<Blip[]>(blips);

  useEffect(() => {
    blipsRef.current = blips;
  }, [blips]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let sweep = -Math.PI / 2;
    let last = performance.now();

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) / 2 - 10;
      // Before layout (or when hidden) the canvas has no size; a negative radius makes arc() throw.
      if (!(R > 1)) return;

      // Rings
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 4, 0, TAU);
        ctx.strokeStyle = i === 4 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)";
        ctx.stroke();
      }

      // Crosshair
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();

      // Ticks on the outer ring
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * TAU;
        const len = i % 6 === 0 ? 9 : 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.lineTo(cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len));
        ctx.strokeStyle = i % 6 === 0 ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.16)";
        ctx.stroke();
      }

      // Sweep wedge
      if (!reduce) {
        const trail = 1.1;
        const grad = ctx.createConicGradient(sweep - trail, cx, cy);
        const end = trail / TAU;
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(end, "rgba(255,255,255,0.26)");
        grad.addColorStop(Math.min(end + 0.001, 1), "rgba(255,255,255,0)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // Blips
      for (const b of blipsRef.current) {
        const x = cx + Math.cos(b.angle) * b.radius * R;
        const y = cy + Math.sin(b.angle) * b.radius * R;
        const since = (((sweep - b.angle) % TAU) + TAU) % TAU;
        const fade = reduce ? 0.8 : 0.22 + 0.78 * Math.pow(1 - since / TAU, 3);
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${fade.toFixed(3)})`;
        ctx.fill();
        if (!reduce && since < 0.6) {
          ctx.beginPath();
          ctx.arc(x, y, 3 + since * 18, 0, TAU);
          ctx.strokeStyle = `rgba(255,255,255,${((1 - since / 0.6) * 0.6).toFixed(3)})`;
          ctx.stroke();
        }
      }

      // Centre
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, TAU);
      ctx.fillStyle = "#fff";
      ctx.fill();
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };

    const frame = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      sweep = (sweep + (dt / 1000) * 0.9) % TAU;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    if (!reduce) raf = requestAnimationFrame(frame);

    // Pause when the tab is hidden.
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="block aspect-square w-full" />;
}
