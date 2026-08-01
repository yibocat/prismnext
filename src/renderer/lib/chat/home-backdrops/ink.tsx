import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { ChatHomeBackdropShell } from "./shared";

/** Deterministic PRNG for stable draft layout. */
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const LEFT_LINES = [
  "TODO: check refs",
  "§2.1 — rewrite?",
  "why this lemma?",
  "cf. Smith 2019",
  "delete paragraph",
  "α → β? no…",
  "margin note:",
  "expand later",
  "ask about proof",
  "???",
];

const RIGHT_LINES = [
  "Draft v0.3",
  "fix notation",
  "Eq. (4) unclear",
  "!!!",
  "ask coauthor",
  "bibliography…",
  "move to appendix",
  "ok for now",
  "see footnote",
  "rephrase",
];

const HAND_FONTS =
  '"Segoe Print", "Bradley Hand", "Apple Chancery", "Marker Felt", Noteworthy, "Comic Sans MS", cursive, serif';

/**
 * Draw a line with per-character jitter so it reads as handwriting, not print.
 */
function drawHandLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x0: number,
  y0: number,
  size: number,
  rot: number,
  color: string,
  alpha: number,
  rand: () => number,
) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${size}px ${HAND_FONTS}`;

  let x = 0;
  for (const ch of text) {
    const jx = (rand() - 0.5) * size * 0.18;
    const jy = (rand() - 0.5) * size * 0.28;
    const jr = (rand() - 0.5) * 0.12;
    const js = 0.88 + rand() * 0.28;

    ctx.save();
    ctx.translate(x + jx, jy);
    ctx.rotate(jr);
    ctx.scale(js, 0.92 + rand() * 0.2);
    ctx.globalAlpha = alpha * (0.75 + rand() * 0.25);
    ctx.fillText(ch, 0, 0);
    ctx.restore();

    x += ctx.measureText(ch).width * (0.9 + rand() * 0.22) + (rand() - 0.5) * 1.2;
  }
  ctx.restore();
}

function drawScribble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  alpha: number,
  rand: () => number,
) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1 + rand() * 0.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  const len = 40 + rand() * 50;
  for (let i = 1; i <= 5; i++) {
    ctx.quadraticCurveTo(
      x + (i / 5) * len + (rand() - 0.5) * 18,
      y + (rand() - 0.5) * 28,
      x + ((i + 0.5) / 5) * len,
      y + Math.sin(i) * 10 + (rand() - 0.5) * 12,
    );
  }
  ctx.stroke();
}

/** Margin draft notes with jittered hand-lettering. */
export function InkBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const LOGICAL_W = 1000;
    const LOGICAL_H = 700;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(LOGICAL_W * dpr);
    canvas.height = Math.floor(LOGICAL_H * dpr);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const color = getComputedStyle(host).color;
    const rand = createRng(0x696e6b31); // "ink1"
    ctx.clearRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Left margin lines — uneven vertical spacing
    let y = 70;
    for (const line of LEFT_LINES) {
      const size = 12 + rand() * 4;
      const rot = (rand() - 0.5) * 0.18;
      const x = 22 + rand() * 28;
      drawHandLine(ctx, line, x, y, size, rot, color, 0.72 + rand() * 0.22, rand);
      if (rand() > 0.55) {
        // strike-through
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(x - 2, y - size * 0.35);
        ctx.lineTo(x + size * line.length * 0.48, y - size * 0.45);
        ctx.stroke();
      }
      if (rand() > 0.7) {
        drawScribble(ctx, x + 8, y + 14, color, 0.4 + rand() * 0.2, rand);
      }
      y += 48 + rand() * 28;
    }

    // Right margin
    y = 60;
    for (const line of RIGHT_LINES) {
      const size = 12 + rand() * 4;
      const rot = (rand() - 0.5) * 0.18;
      const x = 820 + rand() * 40;
      drawHandLine(ctx, line, x, y, size, rot, color, 0.7 + rand() * 0.22, rand);
      if (rand() > 0.6) {
        drawScribble(ctx, x + 10, y + 12, color, 0.38 + rand() * 0.2, rand);
      }
      y += 50 + rand() * 26;
    }

    ctx.globalAlpha = 1;
  }, [resolvedTheme]);

  return (
    <ChatHomeBackdropShell className="text-muted-foreground opacity-90 dark:opacity-78">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </ChatHomeBackdropShell>
  );
}
