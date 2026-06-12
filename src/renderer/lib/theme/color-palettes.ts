// lib/theme/color-palettes.ts
// Two-slider color system: neutrals derive chroma from intensity × hue.

export interface NeutralBase {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}

// Pure neutral (chroma 0) — light mode
const NEUTRAL_LIGHT: NeutralBase = {
  background:        "oklch(1 0 0)",
  foreground:        "oklch(0.145 0 0)",
  card:              "oklch(1 0 0)",
  cardForeground:    "oklch(0.145 0 0)",
  popover:           "oklch(1 0 0)",
  popoverForeground: "oklch(0.145 0 0)",
  secondary:         "oklch(0.97 0 0)",
  secondaryForeground:"oklch(0.205 0 0)",
  muted:             "oklch(0.97 0 0)",
  mutedForeground:   "oklch(0.556 0 0)",
  accent:            "oklch(0.97 0 0)",
  accentForeground:  "oklch(0.205 0 0)",
  border:            "oklch(0.922 0 0)",
  input:             "oklch(0.922 0 0)",
  ring:              "oklch(0.708 0 0)",
};

// Pure neutral (chroma 0) — dark mode
const NEUTRAL_DARK: NeutralBase = {
  background:        "oklch(0.18 0 0)",
  foreground:        "oklch(0.985 0 0)",
  card:              "oklch(0.22 0 0)",
  cardForeground:    "oklch(0.985 0 0)",
  popover:           "oklch(0.22 0 0)",
  popoverForeground: "oklch(0.985 0 0)",
  secondary:         "oklch(0.26 0 0)",
  secondaryForeground:"oklch(0.985 0 0)",
  muted:             "oklch(0.26 0 0)",
  mutedForeground:   "oklch(0.708 0 0)",
  accent:            "oklch(0.26 0 0)",
  accentForeground:  "oklch(0.985 0 0)",
  border:            "oklch(1 0 0 / 10%)",
  input:             "oklch(1 0 0 / 15%)",
  ring:              "oklch(0.556 0 0)",
};

// Surface chroma multipliers — tint strength by surface and mode.
// Light mode needs ~3× higher values because the near-white base (L≈1)
// requires more chroma to produce a visible colour cast. Dark mode surfaces
// (L≈0.18) are perceptually more sensitive to chroma.
export const SURFACE_MULTIPLIERS = {
  light: {
    background:     0.055,
    card:           0.08,
    popover:        0.08,
    secondary:      0.095,
    muted:          0.095,
    accent:         0.12,
    border:         0.12,
    input:          0.12,
    sidebar:        0.08,
    sidebarAccent:  0.25,
  },
  dark: {
    background:     0.025,
    card:           0.04,
    popover:        0.04,
    secondary:      0.065,
    muted:          0.065,
    accent:         0.08,
    border:         0.035,
    input:          0.035,
    sidebar:        0.04,
    sidebarAccent:  0.125,
  },
} as const;

export const MAX_CHROMA = 0.50;
export const DEFAULT_INTENSITY = 0.35; // 25% — balanced starting point

// Parse lightness from an oklch string like "oklch(1 0 0)"
function parseLightness(oklch: string): number {
  const m = oklch.match(/oklch\(([\d.]+)\s/);
  return m ? parseFloat(m[1]) : 1;
}

// Build an oklch color with injected chroma at the given hue
function tint(neutralOklch: string, chroma: number, hue: number): string {
  const L = parseLightness(neutralOklch);
  // For translucent values like "oklch(1 0 0 / 10%)", keep the alpha
  const alphaMatch = neutralOklch.match(/\/\s*([\d.]+%)\)/);
  const alpha = alphaMatch ? ` / ${alphaMatch[1]}` : "";
  return `oklch(${L.toFixed(3)} ${chroma.toFixed(4)} ${hue}${alpha})`;
}

export function generateNeutralVars(intensity: number, hue: number): { light: Record<string, string>; dark: Record<string, string> } {
  // Mono (hue=0): intensity shifts lightness instead of adding chroma.
  //   Dark:  low = lighter gray,   high = deeper near-black
  //   Light: low = near-white,     high = warmer graphite (darker)
  const isMono = hue === 0;
  const maxC = isMono ? 0 : MAX_CHROMA;
  const i = isMono ? 0 : intensity;

  // Mono lightness shift: scales by surface multiplier so accent surfaces
  // get more contrast than background — sidebar hover becomes visible.
  function monoShift(neutralOklch: string, multiplier: number): string {
    if (!isMono) return neutralOklch;
    const L = parseLightness(neutralOklch);
    const shift = intensity * 0.6 * multiplier;
    const alphaMatch = neutralOklch.match(/\/\s*([\d.]+%)\)/);
    const alpha = alphaMatch ? ` / ${alphaMatch[1]}` : "";
    return `oklch(${(L - shift).toFixed(4)} 0 0${alpha})`;
  }

  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  // Surface variables that get tinted — per-mode chroma
  type SurfaceSpec = { key: string; lightRef: keyof typeof NEUTRAL_LIGHT; darkRef: keyof typeof NEUTRAL_DARK };
  const surfaces: SurfaceSpec[] = [
    { key: "--background", lightRef: "background", darkRef: "background" },
    { key: "--card", lightRef: "card", darkRef: "card" },
    { key: "--popover", lightRef: "popover", darkRef: "popover" },
    { key: "--secondary", lightRef: "secondary", darkRef: "secondary" },
    { key: "--muted", lightRef: "muted", darkRef: "muted" },
    { key: "--accent", lightRef: "accent", darkRef: "accent" },
    { key: "--border", lightRef: "border", darkRef: "border" },
    { key: "--input", lightRef: "input", darkRef: "input" },
  ];

  for (const s of surfaces) {
    const k = s.key.replace("--", "") as keyof typeof SURFACE_MULTIPLIERS.light;
    const lightC = i * maxC * SURFACE_MULTIPLIERS.light[k];
    const darkC = i * maxC * SURFACE_MULTIPLIERS.dark[k];
    light[s.key] = monoShift(tint(NEUTRAL_LIGHT[s.lightRef], lightC, hue), SURFACE_MULTIPLIERS.light[k]);
    dark[s.key] = monoShift(tint(NEUTRAL_DARK[s.darkRef], darkC, hue), SURFACE_MULTIPLIERS.dark[k]);
  }

  // Foreground colors stay neutral (no tint) for readability
  light["--foreground"] = NEUTRAL_LIGHT.foreground;
  light["--card-foreground"] = NEUTRAL_LIGHT.cardForeground;
  light["--popover-foreground"] = NEUTRAL_LIGHT.popoverForeground;
  light["--secondary-foreground"] = NEUTRAL_LIGHT.secondaryForeground;
  light["--muted-foreground"] = NEUTRAL_LIGHT.mutedForeground;
  light["--accent-foreground"] = NEUTRAL_LIGHT.accentForeground;

  dark["--foreground"] = NEUTRAL_DARK.foreground;
  dark["--card-foreground"] = NEUTRAL_DARK.cardForeground;
  dark["--popover-foreground"] = NEUTRAL_DARK.popoverForeground;
  dark["--secondary-foreground"] = NEUTRAL_DARK.secondaryForeground;
  dark["--muted-foreground"] = NEUTRAL_DARK.mutedForeground;
  dark["--accent-foreground"] = NEUTRAL_DARK.accentForeground;

  // Ring stays neutral (used for focus rings, should not be heavily tinted)
  light["--ring"] = NEUTRAL_LIGHT.ring;
  dark["--ring"] = NEUTRAL_DARK.ring;

  // Sidebar variables — per-mode chroma
  const lightSidebarC = i * maxC * SURFACE_MULTIPLIERS.light.sidebar;
  const lightSidebarAccentC = i * maxC * SURFACE_MULTIPLIERS.light.sidebarAccent;
  const darkSidebarC = i * maxC * SURFACE_MULTIPLIERS.dark.sidebar;
  const darkSidebarAccentC = i * maxC * SURFACE_MULTIPLIERS.dark.sidebarAccent;

  light["--sidebar"] = monoShift(tint(NEUTRAL_LIGHT.muted, lightSidebarC, hue), SURFACE_MULTIPLIERS.light.sidebar);
  light["--sidebar-foreground"] = monoShift(NEUTRAL_LIGHT.foreground, SURFACE_MULTIPLIERS.light.sidebar);
  light["--sidebar-accent"] = monoShift(tint(NEUTRAL_LIGHT.muted, lightSidebarAccentC, hue), SURFACE_MULTIPLIERS.light.sidebarAccent);
  light["--sidebar-accent-foreground"] = monoShift(NEUTRAL_LIGHT.foreground, SURFACE_MULTIPLIERS.light.sidebarAccent);
  light["--sidebar-border"] = monoShift(tint(NEUTRAL_LIGHT.border, lightSidebarC, hue), SURFACE_MULTIPLIERS.light.sidebar);
  light["--sidebar-ring"] = monoShift(NEUTRAL_LIGHT.ring, SURFACE_MULTIPLIERS.light.sidebar);
  dark["--sidebar"] = monoShift(tint(NEUTRAL_DARK.card, darkSidebarC, hue), SURFACE_MULTIPLIERS.dark.sidebar);
  dark["--sidebar-foreground"] = monoShift(NEUTRAL_DARK.foreground, SURFACE_MULTIPLIERS.dark.sidebar);
  dark["--sidebar-accent"] = monoShift(tint(NEUTRAL_DARK.muted, darkSidebarAccentC, hue), SURFACE_MULTIPLIERS.dark.sidebarAccent);
  dark["--sidebar-accent-foreground"] = monoShift(NEUTRAL_DARK.foreground, SURFACE_MULTIPLIERS.dark.sidebarAccent);
  dark["--sidebar-border"] = monoShift(tint(NEUTRAL_DARK.border, darkSidebarC, hue), SURFACE_MULTIPLIERS.dark.sidebar);
  dark["--sidebar-ring"] = monoShift(NEUTRAL_DARK.ring, SURFACE_MULTIPLIERS.dark.sidebar);

  return { light, dark };
}
