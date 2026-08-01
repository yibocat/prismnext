import { useEffect, useRef } from "react";
import { ChatHomeBackdropShell } from "./shared";

interface Plane {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  bob: number;
  bobAmp: number;
  alpha: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function spawnPlane(w: number, h: number, fromLeft: boolean): Plane {
  const size = 28 + Math.random() * 34;
  const speed = 28 + Math.random() * 22;
  const y = h * (0.12 + Math.random() * 0.55);
  if (fromLeft) {
    return {
      x: -size * 2,
      y,
      vx: speed,
      vy: (Math.random() - 0.45) * 8,
      size,
      rot: -0.22 + Math.random() * 0.12,
      bob: Math.random() * Math.PI * 2,
      bobAmp: 6 + Math.random() * 8,
      alpha: 0.35 + Math.random() * 0.3,
    };
  }
  return {
    x: w + size * 2,
    y,
    vx: -speed * 0.85,
    vy: (Math.random() - 0.55) * 7,
    size: size * 0.85,
    rot: 0.18 + Math.random() * 0.14,
    bob: Math.random() * Math.PI * 2,
    bobAmp: 5 + Math.random() * 7,
    alpha: 0.28 + Math.random() * 0.22,
  };
}

function drawPlane(
  ctx: CanvasRenderingContext2D,
  p: Plane,
  color: string,
  t: number,
) {
  const bobY = Math.sin(t * 0.9 + p.bob) * p.bobAmp;
  ctx.save();
  ctx.translate(p.x, p.y + bobY);
  ctx.rotate(p.rot + Math.sin(t * 0.5 + p.bob) * 0.04);
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = p.alpha;
  ctx.lineWidth = 1.15;

  const s = p.size;
  const facing = p.vx >= 0 ? 1 : -1;
  ctx.scale(facing, 1);

  ctx.beginPath();
  ctx.moveTo(0, s * 0.22);
  ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.72, s * 0.32);
  ctx.lineTo(s, s * 0.64);
  ctx.lineTo(0, s * 0.44);
  ctx.lineTo(s * 0.3, s * 0.32);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(s * 0.3, s * 0.32);
  ctx.lineTo(s * 0.72, s * 0.32);
  ctx.globalAlpha = p.alpha * 0.75;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.restore();
}

/** Sketch paper airplanes that glide across the chat canvas. */
export function PaperplaneBackdrop() {
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
    let planes: Plane[] = [];

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (reduced) {
        planes = [
          { ...spawnPlane(width, height, true), x: width * 0.18, y: height * 0.22 },
          { ...spawnPlane(width, height, false), x: width * 0.72, y: height * 0.48 },
          { ...spawnPlane(width, height, true), x: width * 0.28, y: height * 0.68, size: 26 },
        ];
      } else if (planes.length === 0) {
        planes = [
          spawnPlane(width, height, true),
          spawnPlane(width, height, false),
          spawnPlane(width, height, true),
        ];
        // Stagger starts across the view
        planes[0].x = width * 0.15;
        planes[1].x = width * 0.75;
        planes[2].x = width * 0.4;
        planes[2].y = height * 0.62;
        planes[2].size *= 0.7;
        planes[2].alpha *= 0.85;
      }
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const strokeColor = () => getComputedStyle(host).color;

    let raf = 0;
    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = strokeColor();

      for (const p of planes) {
        if (!reduced) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x > width + p.size * 3 || p.x < -p.size * 3) {
            Object.assign(p, spawnPlane(width, height, p.vx > 0));
          }
          if (p.y < -40 || p.y > height + 40) {
            p.y = Math.max(40, Math.min(height - 40, p.y));
            p.vy *= -0.6;
          }
        }
        drawPlane(ctx, p, color, t);
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
    <ChatHomeBackdropShell className="text-muted-foreground opacity-90 dark:opacity-82">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </ChatHomeBackdropShell>
  );
}
