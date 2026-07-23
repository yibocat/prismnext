// lib/theme/oklch.ts
// Parse/format OKLCH color strings used by the theme pack system.

export interface Oklch {
  l: number;
  c: number;
  h: number;
  alpha?: number;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function clampChroma(c: number): number {
  return Math.min(0.4, Math.max(0, c));
}

export function parseOklch(input: string): Oklch | null {
  const m = input.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%\s*)?\)/i,
  );
  if (!m) return null;
  const l = parseFloat(m[1]);
  const c = parseFloat(m[2]);
  const h = parseFloat(m[3]);
  if (m[4] !== undefined) {
    return { l, c, h, alpha: parseFloat(m[4]) / 100 };
  }
  return { l, c, h };
}

export function formatOklch({ l, c, h, alpha }: Oklch): string {
  const base = `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${h}`;
  if (alpha === undefined) return `${base})`;
  const pct = Math.round(clamp01(alpha) * 100);
  return `${base} / ${pct}%)`;
}
