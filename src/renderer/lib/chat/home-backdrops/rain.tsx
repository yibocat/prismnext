import { useEffect, useRef } from "react";
import { ChatHomeBackdropShell } from "./shared";

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  opacity: number;
  drift: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Gentle falling rain — default for Midnight theme. Static when motion is reduced. */
export function RainBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const dropCount = reduced ? 44 : 82;
    const drops: RainDrop[] = Array.from({ length: dropCount }, () => ({
      x: Math.random() * Math.max(width, 1),
      y: Math.random() * Math.max(height, 1),
      len: 10 + Math.random() * 18,
      speed: 1.2 + Math.random() * 2.2,
      opacity: 0.12 + Math.random() * 0.18,
      drift: 0.3 + Math.random() * 0.5,
    }));

    const strokeColor = () => getComputedStyle(host).color;

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const color = strokeColor();

      for (const d of drops) {
        ctx.globalAlpha = d.opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.drift, d.y + d.len);
        ctx.stroke();

        if (!reduced) {
          d.y += d.speed;
          d.x += d.drift * 0.15;
          if (d.y > height + d.len) {
            d.y = -d.len;
            d.x = Math.random() * width;
          }
        }
      }
      ctx.globalAlpha = 1;

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <ChatHomeBackdropShell className="text-muted-foreground opacity-70 dark:opacity-55">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </ChatHomeBackdropShell>
  );
}
