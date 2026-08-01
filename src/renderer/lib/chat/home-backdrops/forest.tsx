import { useEffect, useRef } from "react";
import { ChatHomeBackdropShell } from "./shared";

type LeafVariant = 0 | 1 | 2;

interface FallingLeaf {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Radians per second — slow pendulum sway. */
  swayOmega: number;
  swayAmp: number;
  phase: number;
  /** Pixels per second downward. */
  speed: number;
  opacity: number;
  variant: LeafVariant;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function createLeaf(w: number, h: number): FallingLeaf {
  return {
    x: Math.random() * Math.max(w, 1),
    y: Math.random() * Math.max(h, 1),
    scale: 0.5 + Math.random() * 0.65,
    rotation: (Math.random() - 0.5) * 0.6,
    swayOmega: 0.45 + Math.random() * 0.35,
    swayAmp: 26 + Math.random() * 34,
    phase: Math.random() * Math.PI * 2,
    speed: 22 + Math.random() * 28,
    opacity: 0.22 + Math.random() * 0.2,
    variant: Math.floor(Math.random() * 3) as LeafVariant,
  };
}

function drawLeafOutline(
  ctx: CanvasRenderingContext2D,
  variant: LeafVariant,
) {
  ctx.beginPath();
  if (variant === 0) {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(18, -7, 42, 3, 46, 22);
    ctx.bezierCurveTo(48, 38, 26, 46, 8, 36);
    ctx.bezierCurveTo(-6, 26, -5, 8, 0, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 6);
    ctx.quadraticCurveTo(20, 22, 38, 30);
    ctx.stroke();
    return;
  }
  if (variant === 1) {
    ctx.moveTo(0, -18);
    ctx.quadraticCurveTo(14, -4, 10, 16);
    ctx.quadraticCurveTo(6, 28, 0, 32);
    ctx.quadraticCurveTo(-6, 28, -10, 16);
    ctx.quadraticCurveTo(-14, -4, 0, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 28);
    ctx.stroke();
    return;
  }
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(12, -10, 30, -6, 34, 10);
  ctx.bezierCurveTo(36, 22, 20, 30, 6, 24);
  ctx.bezierCurveTo(-4, 18, -2, 6, 0, 0);
  ctx.stroke();
}

/** Gentle falling leaves with slow left-right sway — default for Forest theme. */
export function ForestBackdrop() {
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
    let lastTime = performance.now();

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

    const leafCount = reduced ? 12 : 20;
    const leaves: FallingLeaf[] = Array.from({ length: leafCount }, () =>
      createLeaf(width, height),
    );

    const strokeColor = () => getComputedStyle(host).color;

    let raf = 0;
    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const time = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = strokeColor();

      for (const leaf of leaves) {
        const theta = time * leaf.swayOmega + leaf.phase;
        // Slow pendulum + tiny secondary wave (organic, not jitter).
        const swayX = reduced
          ? 0
          : Math.sin(theta) * leaf.swayAmp +
            Math.sin(theta * 0.47 + 1.2) * leaf.swayAmp * 0.18;
        const tilt = reduced ? 0 : Math.sin(theta - 0.5) * 0.28;

        ctx.save();
        ctx.translate(leaf.x + swayX, leaf.y);
        ctx.rotate(leaf.rotation + tilt);
        ctx.scale(leaf.scale, leaf.scale);
        ctx.strokeStyle = color;
        ctx.globalAlpha = leaf.opacity;
        ctx.lineWidth = 0.85;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        drawLeafOutline(ctx, leaf.variant);
        ctx.restore();

        if (!reduced) {
          leaf.y += leaf.speed * dt;

          if (leaf.y > height + 50) {
            Object.assign(leaf, createLeaf(width, height));
            leaf.y = -35 - Math.random() * 45;
          }
        }
      }

      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    if (reduced) {
      draw(performance.now());
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <ChatHomeBackdropShell className="text-muted-foreground opacity-75 dark:opacity-58">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </ChatHomeBackdropShell>
  );
}
