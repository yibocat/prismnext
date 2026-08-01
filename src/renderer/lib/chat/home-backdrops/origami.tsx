import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { ChatHomeBackdropShell } from "./shared";

/** Deterministic PRNG — stable wrinkles across renders. */
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const LOGICAL_W = 1000;
const LOGICAL_H = 700;

function drawKraftWrinkles(ctx: CanvasRenderingContext2D, color: string) {
  const rand = createRng(0x6b726166); // "kraf"

  ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Soft buckling bands — wide, very faint contour curves
  for (let i = 0; i < 5; i++) {
    const y0 = rand() * LOGICAL_H;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.028 + rand() * 0.03;
    ctx.lineWidth = 16 + rand() * 22;
    ctx.beginPath();
    ctx.moveTo(-40, y0);
    for (let x = 0; x <= LOGICAL_W + 40; x += 80) {
      ctx.quadraticCurveTo(
        x + 40,
        y0 + (rand() - 0.5) * 90,
        x + 80,
        y0 + (rand() - 0.5) * 70,
      );
    }
    ctx.stroke();
  }

  // Major creases — irregular quadratic arcs
  for (let i = 0; i < 13; i++) {
    const x1 = rand() * LOGICAL_W;
    const y1 = rand() * LOGICAL_H;
    const cx = rand() * LOGICAL_W;
    const cy = rand() * LOGICAL_H;
    const x2 = rand() * LOGICAL_W;
    const y2 = rand() * LOGICAL_H;

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.06 + rand() * 0.09;
    ctx.lineWidth = 0.9 + rand() * 1.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();

    // Crease valley — tight parallel hint
    if (rand() > 0.62) {
      const ox = (rand() - 0.5) * 5;
      const oy = (rand() - 0.5) * 5;
      ctx.globalAlpha *= 0.55;
      ctx.lineWidth *= 0.65;
      ctx.beginPath();
      ctx.moveTo(x1 + ox, y1 + oy);
      ctx.quadraticCurveTo(cx + ox, cy + oy, x2 + ox, y2 + oy);
      ctx.stroke();
    }
  }

  // Fine micro-creases — short scratches
  for (let i = 0; i < 22; i++) {
    const x = rand() * LOGICAL_W;
    const y = rand() * LOGICAL_H;
    const len = 24 + rand() * 72;
    const angle = rand() * Math.PI * 2;
    const bend = (rand() - 0.5) * 28;

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.03 + rand() * 0.055;
    ctx.lineWidth = 0.35 + rand() * 0.45;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle) * len * 0.5 + bend,
      y + Math.sin(angle) * len * 0.5 - bend,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len,
    );
    ctx.stroke();
  }

  // Crumple hubs — several short lines radiating from a point
  for (let h = 0; h < 5; h++) {
    const hx = 120 + rand() * (LOGICAL_W - 240);
    const hy = 80 + rand() * (LOGICAL_H - 160);
    const spokes = 3 + Math.floor(rand() * 3);

    for (let s = 0; s < spokes; s++) {
      const angle = rand() * Math.PI * 2;
      const len = 28 + rand() * 58;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.04 + rand() * 0.065;
      ctx.lineWidth = 0.5 + rand() * 0.8;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(
        hx + Math.cos(angle) * len * 0.45 + (rand() - 0.5) * 12,
        hy + Math.sin(angle) * len * 0.45 + (rand() - 0.5) * 12,
        hx + Math.cos(angle) * len,
        hy + Math.sin(angle) * len,
      );
      ctx.stroke();
    }
  }

  // Kraft fiber grain — sparse speckle (no image assets)
  const speckles = Math.floor((LOGICAL_W * LOGICAL_H) / 1800);
  for (let i = 0; i < speckles; i++) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.018 + rand() * 0.028;
    const w = rand() > 0.82 ? 2 : 1;
    ctx.fillRect(rand() * LOGICAL_W, rand() * LOGICAL_H, w, w);
  }

  ctx.globalAlpha = 1;
}

/** Scribble / doodle creases — default for Warm Paper theme. */
export function OrigamiBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(LOGICAL_W * dpr);
    canvas.height = Math.floor(LOGICAL_H * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawKraftWrinkles(ctx, getComputedStyle(host).color);
  }, [resolvedTheme]);

  return (
    <ChatHomeBackdropShell className="text-muted-foreground opacity-72 dark:opacity-58">
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
    </ChatHomeBackdropShell>
  );
}
