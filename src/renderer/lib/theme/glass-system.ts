// src/renderer/lib/theme/glass-system.ts
// Single source of truth for all glass tier values, CSS generation, and vibrancy mapping.

export type GlassSurface = "sidebar" | "body" | "content" | "toolbar";
export type GlassTier = 1 | 2 | 3 | 4 | 5;
export type GlassMode = "light" | "dark";

export interface GlassConfig {
  tier: GlassTier;
}

// ── Tier Presets ──
// Each surface has light[5] and dark[5] arrays.
// Index 0 = tier 1 (Minimal), index 4 = tier 5 (Max).
// Values are opacity percentages: higher = more solid, lower = more transparent.

export const GLASS_TIER_PRESETS: Record<
  GlassSurface,
  { light: [number, number, number, number, number]; dark: [number, number, number, number, number] }
> = {
  sidebar: {
    light: [80, 70, 60, 50, 40], // Δ = 40pp — steep curve
    dark: [75, 65, 55, 45, 35],   // Δ = 40pp
  },
  body: {
    light: [92, 88, 84, 80, 76], // Δ = 16pp — flat curve
    dark: [88, 84, 80, 76, 72],   // Δ = 16pp
  },
  content: {
    light: [88, 84, 80, 76, 72], // Δ = 16pp
    dark: [84, 80, 76, 72, 68],   // Δ = 16pp
  },
  toolbar: {
    light: [85, 80, 75, 70, 65], // Δ = 20pp — moderate curve
    dark: [80, 76, 72, 68, 64],   // Δ = 16pp
  },
};

// ── Border Presets ──
// Light mode: borders darken as glass intensifies (maintain visibility)
// Dark mode: borders lighten/subtler as glass intensifies (avoid harshness)
// Values are alpha for rgba()

export const GLASS_BORDER_PRESETS: Record<
  GlassMode,
  [number, number, number, number, number]
> = {
  light: [0.12, 0.15, 0.18, 0.22, 0.26], // rgba(0,0,0, α) — increasing
  dark: [0.15, 0.14, 0.13, 0.12, 0.10],  // rgba(255,255,255, α) — decreasing
};

// ── Edge Glow ──
// Subtle inset shadow that defines glass surface silhouette
// Fixed across tiers — just varies by mode

export const GLASS_EDGE_GLOW: Record<GlassMode, string> = {
  light: "rgba(255, 255, 255, 0.04)",
  dark: "rgba(255, 255, 255, 0.02)",
};

// ── Tier Labels (for settings UI) ──

export const GLASS_TIER_LABELS: Record<GlassTier, string> = {
  1: "Minimal",
  2: "Subtle",
  3: "Medium",
  4: "Strong",
  5: "Max",
};

// ── CSS Generation ──
// Returns { root, dark } — CSS custom property declarations for :root (light) and .dark.
// The caller places `root` inside `:root { ... }` and `dark` inside `.dark { ... }`.
// When glass is off, callers skip this function — no --glass-* vars = solid fallbacks.

export function generateGlassCSS(config: GlassConfig): { root: string; dark: string } {
  const tierIdx = config.tier - 1; // 1-based → 0-based array index

  function surfaceVar(surface: GlassSurface, mode: GlassMode): string {
    const opacity = GLASS_TIER_PRESETS[surface][mode][tierIdx];
    const baseVar = surface === "sidebar" ? "var(--sidebar)" : "var(--background)";
    return `color-mix(in srgb, ${baseVar} ${opacity}%, transparent)`;
  }

  function borderVar(mode: GlassMode): string {
    const alpha = GLASS_BORDER_PRESETS[mode][tierIdx];
    return mode === "light"
      ? `rgba(0, 0, 0, ${alpha})`
      : `rgba(255, 255, 255, ${alpha})`;
  }

  function buildBlock(mode: GlassMode): string {
    return [
      `--glass-sidebar-bg: ${surfaceVar("sidebar", mode)};`,
      `--glass-body-bg: ${surfaceVar("body", mode)};`,
      `--glass-content-bg: ${surfaceVar("content", mode)};`,
      `--glass-toolbar-bg: ${surfaceVar("toolbar", mode)};`,
      `--glass-border: ${borderVar(mode)};`,
      `--glass-edge-glow: ${GLASS_EDGE_GLOW[mode]};`,
    ].join("\n      ");
  }

  return {
    root: buildBlock("light"),
    dark: buildBlock("dark"),
  };
}

// ── Vibrancy Material Mapping ──
// Maps app theme mode to Electron vibrancy material string.

export function getVibrancyMaterial(mode: GlassMode): string {
  return mode === "dark" ? "dark" : "light";
}
