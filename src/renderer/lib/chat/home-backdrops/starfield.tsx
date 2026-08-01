import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { ChatHomeBackdropShell } from "./shared";

interface Star {
  x: number;
  y: number;
  r: number;
  bright: number;
  period: number;
  phase: number;
}

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
  bob: number;
}

interface Meteor {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  maxLife: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function skyY(h: number): number {
  return Math.pow(Math.random(), 1.4) * h * 0.78;
}

function createStars(w: number, h: number, count: number): Star[] {
  return Array.from({ length: count }, () => {
    const twinkles = Math.random() < 0.48;
    return {
      x: Math.random() * w,
      y: skyY(h),
      r: 0.32 + Math.random() * 0.42,
      bright: 0.3 + Math.random() * 0.38,
      period: twinkles ? 2.6 + Math.random() * 3.4 : 0,
      phase: Math.random() * 10,
    };
  });
}

function createClouds(w: number, h: number): Cloud[] {
  const sizes = [88, 72, 96];
  return sizes.map((size, i) => ({
    x: (w / sizes.length) * (i + 0.5) + (Math.random() - 0.5) * 80,
    y: h * (0.1 + i * 0.11 + Math.random() * 0.06),
    size,
    speed: 5 + i * 2,
    bob: Math.random() * Math.PI * 2,
  }));
}

/** Spawn interval: ~1.8–3.6s between streaks (dark mode only). */
function nextMeteorDelay(): number {
  return 1800 + Math.random() * 1800;
}

function spawnMeteor(w: number, h: number): Meteor {
  // Start inside the upper radial-mask sweet spot so trails aren't clipped to nothing.
  const x = w * (0.12 + Math.random() * 0.62);
  const y = -20 - Math.random() * 40;
  const speed = 380 + Math.random() * 220;
  const angle = Math.PI / 4.8 + Math.random() * 0.35;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    len: 64 + Math.random() * 44,
    life: 0,
    maxLife: 0.7 + Math.random() * 0.4,
  };
}

/** Round crescent moon — geometric body, light sketch rim. */
function drawCrescentMoon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.fillStyle = color;

  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(cx + r * 0.44, cy - r * 0.04, r * 0.86, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.5;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.28;
  for (const [dx, dy, cr] of [
    [-r * 0.18, r * 0.1, r * 0.055],
    [r * 0.04, -r * 0.16, r * 0.04],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, cr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Round sun disc + short uneven rays (sketch feel, perfect circle). */
function drawSun(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";

  const rays = 10;
  ctx.globalAlpha = alpha * 0.42;
  ctx.lineWidth = 1.15;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    const outer = r * (1.28 + (i % 3) * 0.1);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1));
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.stroke();
  }

  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.48;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Soft cloud built from overlapping circles + one smooth top outline.
 * All puffs are round — reads as a single fluffy mass, not flat ellipses.
 */
function drawCloud(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha: number,
) {
  const puffs = [
    { ox: 0, oy: 0, r: size * 0.34 },
    { ox: -size * 0.28, oy: size * 0.1, r: size * 0.24 },
    { ox: size * 0.3, oy: size * 0.08, r: size * 0.26 },
    { ox: -size * 0.1, oy: -size * 0.12, r: size * 0.2 },
    { ox: size * 0.12, oy: -size * 0.1, r: size * 0.18 },
  ];

  ctx.save();
  ctx.fillStyle = color;

  ctx.globalAlpha = alpha * 0.14;
  for (const p of puffs) {
    ctx.beginPath();
    ctx.arc(cx + p.ox, cy + p.oy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const baseY = cy + size * 0.2;
  const leftX = cx - size * 0.5;
  const rightX = cx + size * 0.5;

  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha * 0.36;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(leftX, baseY);
  ctx.arc(cx - size * 0.28, cy + size * 0.1, size * 0.24, Math.PI * 1.02, Math.PI * 0.08, false);
  ctx.arc(cx - size * 0.1, cy - size * 0.12, size * 0.2, Math.PI * 0.95, Math.PI * 0.22, false);
  ctx.arc(cx, cy, size * 0.34, Math.PI * 1.05, Math.PI * 0.02, false);
  ctx.arc(cx + size * 0.12, cy - size * 0.1, size * 0.18, Math.PI * 0.92, Math.PI * 0.28, false);
  ctx.arc(cx + size * 0.3, cy + size * 0.08, size * 0.26, Math.PI * 1.0, Math.PI * 0.12, false);
  ctx.lineTo(rightX, baseY);
  ctx.stroke();
  ctx.restore();
}

/** Dark: round crescent moon + twinkling stars. Light: round sun + soft clouds. */
export function StarfieldBackdrop() {
  const { resolvedTheme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = resolvedTheme === "dark";
    const reduced = prefersReducedMotion();
    let width = 0;
    let height = 0;
    let lastTime = performance.now();
    let stars: Star[] = [];
    let clouds: Cloud[] = [];
    let meteors: Meteor[] = [];
    let nextMeteorAt = performance.now() + 200;

    const syncSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = host.clientWidth;
      height = host.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = createStars(width, height, reduced ? 72 : 108);
      clouds = createClouds(width, height);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(host);

    const strokeColor = () => getComputedStyle(host).color;

    const moonPos = () => ({
      x: width * 0.78,
      y: height * 0.14,
      r: Math.min(width, height) * 0.05,
    });

    const sunPos = () => ({
      x: width * 0.2,
      y: height * 0.13,
      r: Math.min(width, height) * 0.046,
    });

    let raf = 0;
    const draw = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);
      const color = strokeColor();

      if (isDark) {
        const moon = moonPos();
        drawCrescentMoon(ctx, moon.x, moon.y, moon.r, color, 0.4);

        for (const s of stars) {
          let alpha = s.bright;
          if (!reduced && s.period > 0) {
            const wave = 0.5 + 0.5 * Math.sin(((t + s.phase) / s.period) * Math.PI * 2);
            alpha = s.bright * (0.28 + wave * 0.72);
          }

          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.globalAlpha = alpha;
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (!reduced) {
          if (now >= nextMeteorAt) {
            meteors.push(spawnMeteor(width, height));
            if (Math.random() > 0.78) meteors.push(spawnMeteor(width, height));
            nextMeteorAt = now + nextMeteorDelay();
          }

          meteors = meteors.filter((m) => {
            m.life += dt;
            m.x += m.vx * dt;
            m.y += m.vy * dt;
            const fade = 1 - m.life / m.maxLife;
            if (fade <= 0) return false;

            const hyp = Math.hypot(m.vx, m.vy) || 1;
            const nx = m.vx / hyp;
            const ny = m.vy / hyp;

            ctx.strokeStyle = color;
            ctx.lineCap = "round";

            // Soft outer trail
            ctx.globalAlpha = 0.14 * fade;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - nx * m.len * 1.08, m.y - ny * m.len * 1.08);
            ctx.stroke();

            // Bright core
            ctx.globalAlpha = 0.75 * fade;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(m.x, m.y);
            ctx.lineTo(m.x - nx * m.len, m.y - ny * m.len);
            ctx.stroke();

            // Head
            ctx.beginPath();
            ctx.globalAlpha = 0.85 * fade;
            ctx.arc(m.x, m.y, 1.15, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            return true;
          });
        }
      } else {
        const sun = sunPos();
        drawSun(ctx, sun.x, sun.y, sun.r, color, 0.36);

        for (const c of clouds) {
          if (!reduced) {
            c.x += c.speed * dt;
            if (c.x > width + c.size) c.x = -c.size;
          }
          const bob = reduced ? 0 : Math.sin(t * 0.4 + c.bob) * 2;
          drawCloud(ctx, c.x, c.y + bob, c.size, color, 0.55);
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
  }, [resolvedTheme]);

  return (
    <ChatHomeBackdropShell className="text-muted-foreground opacity-90 dark:opacity-85">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </ChatHomeBackdropShell>
  );
}
