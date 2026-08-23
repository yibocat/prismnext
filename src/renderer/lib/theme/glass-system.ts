// Left-sidebar glass tint. Native blur is Electron 43 vibrancy/mica;
// these vars only punch a hole in the left chrome so the desktop shows through.

export type GlassTier = 1 | 2 | 3 | 4 | 5;
export type GlassMode = "light" | "dark";

export interface GlassConfig {
  tier: GlassTier;
}

/** Sidebar mix % (higher = more opaque). Intensity 1–5. */
export const GLASS_TIER_PRESETS: Record<
  GlassMode,
  [number, number, number, number, number]
> = {
  light: [80, 70, 60, 50, 40],
  dark: [75, 65, 55, 45, 35],
};

export const GLASS_BORDER_PRESETS: Record<
  GlassMode,
  [number, number, number, number, number]
> = {
  light: [0.12, 0.15, 0.18, 0.22, 0.26],
  dark: [0.15, 0.14, 0.13, 0.12, 0.10],
};

export const GLASS_EDGE_GLOW: Record<GlassMode, string> = {
  light: "rgba(255, 255, 255, 0.04)",
  dark: "rgba(255, 255, 255, 0.02)",
};

export const GLASS_TIER_LABELS: Record<GlassTier, string> = {
  1: "Minimal",
  2: "Subtle",
  3: "Medium",
  4: "Strong",
  5: "Max",
};

/** CSS custom properties for :root (light) and .dark. Skip when glass is off. */
export function generateGlassCSS(config: GlassConfig): { root: string; dark: string } {
  const tierIdx = config.tier - 1;

  function sidebarVar(mode: GlassMode): string {
    const opacity = GLASS_TIER_PRESETS[mode][tierIdx];
    return `color-mix(in srgb, var(--sidebar) ${opacity}%, transparent)`;
  }

  function borderVar(mode: GlassMode): string {
    const alpha = GLASS_BORDER_PRESETS[mode][tierIdx];
    return mode === "light"
      ? `rgba(0, 0, 0, ${alpha})`
      : `rgba(255, 255, 255, ${alpha})`;
  }

  function buildBlock(mode: GlassMode): string {
    return [
      `--glass-sidebar-bg: ${sidebarVar(mode)};`,
      `--glass-border: ${borderVar(mode)};`,
      `--glass-edge-glow: ${GLASS_EDGE_GLOW[mode]};`,
    ].join("\n      ");
  }

  return {
    root: buildBlock("light"),
    dark: buildBlock("dark"),
  };
}
