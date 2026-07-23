// lib/theme/theme-packs.ts
// Curated two-color theme packs: Brand (loud primary) + Accent (companion hue,
// used as a soft tint for hover/selection fills and at full strength in charts).
//
// Each pack is a *designed* palette, not a single hue + gray. The companion hue
// gives every theme a distinct color personality:
//   academic   blue  + gold   (complementary)
//   midnight   violet+ teal   (split-complementary)
//   forest     green + amber  (analogous warm)
//   warm-paper terra + teal   (complementary)
//   graphite   ink   + slate  (mono + one drop)
//
// Neutral shells keep a whisper of the brand temperature (cool/warm/gray).
// Card ≈ pure white on a slightly grayer canvas (the shadcn gallery lift).

import type { ChartPalette } from "./chart-palettes";

export type ThemePackId =
  | "academic"
  | "midnight"
  | "forest"
  | "warm-paper"
  | "graphite";

export const THEME_PACK_IDS: ThemePackId[] = [
  "academic",
  "midnight",
  "forest",
  "warm-paper",
  "graphite",
];

export interface ThemeAnchors {
  brand: { base: string; foreground: string; ring: string };
  secondary: { base: string; foreground: string };
  accent: { base: string; foreground: string };
  neutral: {
    background: string;
    foreground: string;
    card: string;
    cardForeground: string;
    popover: string;
    popoverForeground: string;
    muted: string;
    mutedForeground: string;
    border: string;
    input: string;
    sidebar: string;
    sidebarForeground: string;
    sidebarAccent: string;
    sidebarAccentForeground: string;
    sidebarBorder: string;
    sidebarRing: string;
  };
  semantic: {
    destructive: string;
    destructiveForeground: string;
    success: string;
    successForeground: string;
    warning: string;
    warningForeground: string;
  };
}

export interface ThemePack {
  id: ThemePackId;
  labelKey: string;
  descriptionKey: string;
  /** [brand, accent, background, destructive] - for the picker swatch. */
  swatches: { light: string[]; dark: string[] };
  /** Per-theme 5-color chart palette derived from brand + companion. */
  chart: ChartPalette;
  balanced: { light: ThemeAnchors; dark: ThemeAnchors };
}

function anchors(light: ThemeAnchors, dark: ThemeAnchors): { light: ThemeAnchors; dark: ThemeAnchors } {
  return { light, dark };
}

/** Canvas slightly below pure white; card/popover white - shadcn gallery lift.
 *  Sidebar is a step DARKER than the canvas (not lighter) so the rail reads as
 *  a recessed panel; it also carries a touch more brand-hue chroma so each
 *  theme's temperature is perceptible at a glance. Borders are darkened so
 *  dividers stay visible on the airy light shell. */
function lightShell(h: number) {
  return {
    background: `oklch(0.97 0.005 ${h})`,
    foreground: `oklch(0.205 0.01 ${h})`,
    card: `oklch(1 0 0)`,
    cardForeground: `oklch(0.205 0.01 ${h})`,
    popover: `oklch(1 0 0)`,
    popoverForeground: `oklch(0.205 0.01 ${h})`,
    muted: `oklch(0.96 0.008 ${h})`,
    mutedForeground: `oklch(0.50 0.015 ${h})`,
    border: `oklch(0.86 0.01 ${h})`,
    input: `oklch(0.86 0.01 ${h})`,
    sidebar: `oklch(0.95 0.014 ${h})`,
    sidebarForeground: `oklch(0.205 0.01 ${h})`,
    sidebarBorder: `oklch(0.86 0.01 ${h})`,
  };
}

function darkShell(h: number) {
  return {
    background: `oklch(0.16 0.01 ${h})`,
    foreground: `oklch(0.96 0.006 ${h})`,
    card: `oklch(0.20 0.012 ${h})`,
    cardForeground: `oklch(0.96 0.006 ${h})`,
    popover: `oklch(0.20 0.012 ${h})`,
    popoverForeground: `oklch(0.96 0.006 ${h})`,
    muted: `oklch(0.25 0.014 ${h})`,
    mutedForeground: `oklch(0.70 0.015 ${h})`,
    border: `oklch(0.32 0.014 ${h})`,
    input: `oklch(0.32 0.014 ${h})`,
    sidebar: `oklch(0.20 0.012 ${h})`,
    sidebarForeground: `oklch(0.96 0.006 ${h})`,
    sidebarBorder: `oklch(0.32 0.014 ${h})`,
  };
}

function packLight(
  h: number,
  brand: { base: string; foreground: string; ring: string },
  accent: { base: string; foreground: string },
  secondary: { base: string; foreground: string },
  semantic: ThemeAnchors["semantic"],
): ThemeAnchors {
  const shell = lightShell(h);
  return {
    brand,
    secondary,
    accent,
    neutral: {
      ...shell,
      sidebarAccent: accent.base,
      sidebarAccentForeground: accent.foreground,
      sidebarRing: brand.ring,
    },
    semantic,
  };
}

function packDark(
  h: number,
  brand: { base: string; foreground: string; ring: string },
  accent: { base: string; foreground: string },
  secondary: { base: string; foreground: string },
  semantic: ThemeAnchors["semantic"],
): ThemeAnchors {
  const shell = darkShell(h);
  return {
    brand,
    secondary,
    accent,
    neutral: {
      ...shell,
      sidebarAccent: accent.base,
      sidebarAccentForeground: accent.foreground,
      sidebarRing: brand.ring,
    },
    semantic,
  };
}

/** Academic - slate shell + blue brand + gold companion (charts: blue/gold family) */
export const ACADEMIC_PACK: ThemePack = {
  id: "academic",
  labelKey: "settings.appearance.packs.academic",
  descriptionKey: "settings.appearance.packs.academicDesc",
  chart: {
    light: [
      "oklch(0.55 0.18 255)",
      "oklch(0.70 0.15 75)",
      "oklch(0.60 0.12 190)",
      "oklch(0.62 0.15 330)",
      "oklch(0.55 0.14 145)",
    ],
    dark: [
      "oklch(0.70 0.14 255)",
      "oklch(0.80 0.12 75)",
      "oklch(0.72 0.10 190)",
      "oklch(0.68 0.13 330)",
      "oklch(0.70 0.11 145)",
    ],
  },
  swatches: {
    light: [
      "oklch(0.50 0.16 255)",
      "oklch(0.95 0.035 75)",
      "oklch(0.97 0.004 255)",
      "oklch(0.55 0.18 25)",
    ],
    dark: [
      "oklch(0.70 0.13 255)",
      "oklch(0.30 0.04 75)",
      "oklch(0.16 0.01 255)",
      "oklch(0.65 0.14 25)",
    ],
  },
  balanced: anchors(
    packLight(
      255,
      {
        base: "oklch(0.50 0.16 255)",
        foreground: "oklch(0.99 0 0)",
        ring: "oklch(0.55 0.14 255)",
      },
      { base: "oklch(0.95 0.035 75)", foreground: "oklch(0.42 0.11 75)" },
      { base: "oklch(0.95 0.03 255)", foreground: "oklch(0.35 0.10 255)" },
      {
        destructive: "oklch(0.55 0.18 25)",
        destructiveForeground: "oklch(0.99 0 0)",
        success: "oklch(0.52 0.12 155)",
        successForeground: "oklch(0.99 0 0)",
        warning: "oklch(0.75 0.12 75)",
        warningForeground: "oklch(0.28 0.04 75)",
      },
    ),
    packDark(
      255,
      {
        base: "oklch(0.70 0.13 255)",
        foreground: "oklch(0.16 0.03 255)",
        ring: "oklch(0.70 0.13 255)",
      },
      { base: "oklch(0.30 0.04 75)", foreground: "oklch(0.82 0.08 75)" },
      { base: "oklch(0.30 0.035 255)", foreground: "oklch(0.82 0.08 255)" },
      {
        destructive: "oklch(0.65 0.14 25)",
        destructiveForeground: "oklch(0.15 0.02 25)",
        success: "oklch(0.70 0.11 155)",
        successForeground: "oklch(0.15 0.02 155)",
        warning: "oklch(0.78 0.10 75)",
        warningForeground: "oklch(0.16 0.02 75)",
      },
    ),
  ),
};

/** Midnight - cool shell + violet brand + teal companion */
export const MIDNIGHT_PACK: ThemePack = {
  id: "midnight",
  labelKey: "settings.appearance.packs.midnight",
  descriptionKey: "settings.appearance.packs.midnightDesc",
  chart: {
    light: [
      "oklch(0.55 0.18 295)",
      "oklch(0.60 0.13 190)",
      "oklch(0.58 0.16 350)",
      "oklch(0.62 0.14 75)",
      "oklch(0.55 0.13 155)",
    ],
    dark: [
      "oklch(0.70 0.14 295)",
      "oklch(0.72 0.10 190)",
      "oklch(0.68 0.13 350)",
      "oklch(0.72 0.11 75)",
      "oklch(0.70 0.10 155)",
    ],
  },
  swatches: {
    light: [
      "oklch(0.48 0.18 295)",
      "oklch(0.95 0.03 190)",
      "oklch(0.97 0.004 290)",
      "oklch(0.55 0.16 350)",
    ],
    dark: [
      "oklch(0.72 0.13 295)",
      "oklch(0.30 0.035 190)",
      "oklch(0.16 0.012 290)",
      "oklch(0.65 0.12 350)",
    ],
  },
  balanced: anchors(
    packLight(
      290,
      {
        base: "oklch(0.48 0.18 295)",
        foreground: "oklch(0.99 0 0)",
        ring: "oklch(0.52 0.16 295)",
      },
      { base: "oklch(0.95 0.03 190)", foreground: "oklch(0.40 0.08 190)" },
      { base: "oklch(0.95 0.03 295)", foreground: "oklch(0.35 0.10 295)" },
      {
        destructive: "oklch(0.55 0.16 350)",
        destructiveForeground: "oklch(0.99 0 0)",
        success: "oklch(0.52 0.11 170)",
        successForeground: "oklch(0.99 0 0)",
        warning: "oklch(0.75 0.11 75)",
        warningForeground: "oklch(0.28 0.03 75)",
      },
    ),
    packDark(
      290,
      {
        base: "oklch(0.72 0.13 295)",
        foreground: "oklch(0.14 0.04 295)",
        ring: "oklch(0.72 0.13 295)",
      },
      { base: "oklch(0.30 0.035 190)", foreground: "oklch(0.80 0.07 190)" },
      { base: "oklch(0.30 0.035 295)", foreground: "oklch(0.82 0.08 295)" },
      {
        destructive: "oklch(0.65 0.12 350)",
        destructiveForeground: "oklch(0.14 0.02 350)",
        success: "oklch(0.70 0.10 170)",
        successForeground: "oklch(0.14 0.02 170)",
        warning: "oklch(0.78 0.09 75)",
        warningForeground: "oklch(0.15 0.02 75)",
      },
    ),
  ),
};

/** Forest - olive shell + emerald brand + amber companion */
export const FOREST_PACK: ThemePack = {
  id: "forest",
  labelKey: "settings.appearance.packs.forest",
  descriptionKey: "settings.appearance.packs.forestDesc",
  chart: {
    light: [
      "oklch(0.50 0.14 155)",
      "oklch(0.68 0.14 90)",
      "oklch(0.55 0.13 40)",
      "oklch(0.60 0.12 190)",
      "oklch(0.58 0.15 330)",
    ],
    dark: [
      "oklch(0.72 0.11 155)",
      "oklch(0.80 0.11 90)",
      "oklch(0.74 0.11 40)",
      "oklch(0.72 0.10 190)",
      "oklch(0.70 0.12 330)",
    ],
  },
  swatches: {
    light: [
      "oklch(0.45 0.14 155)",
      "oklch(0.95 0.035 90)",
      "oklch(0.97 0.005 145)",
      "oklch(0.55 0.16 30)",
    ],
    dark: [
      "oklch(0.72 0.11 155)",
      "oklch(0.30 0.04 90)",
      "oklch(0.16 0.012 145)",
      "oklch(0.65 0.12 30)",
    ],
  },
  balanced: anchors(
    packLight(
      145,
      {
        base: "oklch(0.45 0.14 155)",
        foreground: "oklch(0.99 0 0)",
        ring: "oklch(0.48 0.13 155)",
      },
      { base: "oklch(0.95 0.035 90)", foreground: "oklch(0.42 0.10 90)" },
      { base: "oklch(0.95 0.03 155)", foreground: "oklch(0.35 0.09 155)" },
      {
        destructive: "oklch(0.55 0.16 30)",
        destructiveForeground: "oklch(0.99 0 0)",
        success: "oklch(0.50 0.12 150)",
        successForeground: "oklch(0.99 0 0)",
        warning: "oklch(0.75 0.11 85)",
        warningForeground: "oklch(0.28 0.04 85)",
      },
    ),
    packDark(
      145,
      {
        base: "oklch(0.72 0.11 155)",
        foreground: "oklch(0.14 0.03 155)",
        ring: "oklch(0.72 0.11 155)",
      },
      { base: "oklch(0.30 0.04 90)", foreground: "oklch(0.82 0.08 90)" },
      { base: "oklch(0.30 0.035 155)", foreground: "oklch(0.82 0.07 155)" },
      {
        destructive: "oklch(0.65 0.12 30)",
        destructiveForeground: "oklch(0.14 0.02 30)",
        success: "oklch(0.70 0.10 150)",
        successForeground: "oklch(0.14 0.02 150)",
        warning: "oklch(0.78 0.09 85)",
        warningForeground: "oklch(0.15 0.02 85)",
      },
    ),
  ),
};

/** Warm Paper - warm stone shell + terracotta brand + teal companion */
export const WARM_PAPER_PACK: ThemePack = {
  id: "warm-paper",
  labelKey: "settings.appearance.packs.warmPaper",
  descriptionKey: "settings.appearance.packs.warmPaperDesc",
  chart: {
    light: [
      "oklch(0.57 0.15 40)",
      "oklch(0.60 0.12 185)",
      "oklch(0.62 0.14 75)",
      "oklch(0.55 0.13 330)",
      "oklch(0.52 0.12 155)",
    ],
    dark: [
      "oklch(0.74 0.11 40)",
      "oklch(0.72 0.10 185)",
      "oklch(0.74 0.11 75)",
      "oklch(0.70 0.11 330)",
      "oklch(0.70 0.10 155)",
    ],
  },
  swatches: {
    light: [
      "oklch(0.52 0.14 40)",
      "oklch(0.95 0.03 185)",
      "oklch(0.97 0.006 55)",
      "oklch(0.55 0.16 25)",
    ],
    dark: [
      "oklch(0.74 0.11 40)",
      "oklch(0.30 0.035 185)",
      "oklch(0.16 0.014 55)",
      "oklch(0.65 0.12 25)",
    ],
  },
  balanced: anchors(
    packLight(
      55,
      {
        base: "oklch(0.52 0.14 40)",
        foreground: "oklch(0.99 0 0)",
        ring: "oklch(0.55 0.13 40)",
      },
      { base: "oklch(0.95 0.03 185)", foreground: "oklch(0.40 0.08 185)" },
      { base: "oklch(0.95 0.03 40)", foreground: "oklch(0.35 0.10 40)" },
      {
        destructive: "oklch(0.55 0.16 25)",
        destructiveForeground: "oklch(0.99 0 0)",
        success: "oklch(0.52 0.10 152)",
        successForeground: "oklch(0.99 0 0)",
        warning: "oklch(0.75 0.12 75)",
        warningForeground: "oklch(0.28 0.04 75)",
      },
    ),
    packDark(
      55,
      {
        base: "oklch(0.74 0.11 40)",
        foreground: "oklch(0.16 0.03 40)",
        ring: "oklch(0.74 0.11 40)",
      },
      { base: "oklch(0.30 0.035 185)", foreground: "oklch(0.80 0.07 185)" },
      { base: "oklch(0.30 0.035 40)", foreground: "oklch(0.82 0.08 40)" },
      {
        destructive: "oklch(0.65 0.12 25)",
        destructiveForeground: "oklch(0.14 0.02 25)",
        success: "oklch(0.70 0.09 152)",
        successForeground: "oklch(0.14 0.02 152)",
        warning: "oklch(0.78 0.10 75)",
        warningForeground: "oklch(0.15 0.02 75)",
      },
    ),
  ),
};

/** Graphite - pure gray/black/white minimalism. No companion hue anywhere.
 *  Selection hierarchy is carried by lightness steps, never by chroma. */
export const GRAPHITE_PACK: ThemePack = {
  id: "graphite",
  labelKey: "settings.appearance.packs.graphite",
  descriptionKey: "settings.appearance.packs.graphiteDesc",
  chart: {
    light: [
      "oklch(0.30 0 0)",
      "oklch(0.45 0 0)",
      "oklch(0.60 0 0)",
      "oklch(0.72 0 0)",
      "oklch(0.85 0 0)",
    ],
    dark: [
      "oklch(0.88 0 0)",
      "oklch(0.72 0 0)",
      "oklch(0.55 0 0)",
      "oklch(0.42 0 0)",
      "oklch(0.28 0 0)",
    ],
  },
  swatches: {
    light: [
      "oklch(0.28 0 0)",
      "oklch(0.91 0 0)",
      "oklch(0.97 0 0)",
      "oklch(0.50 0 0)",
    ],
    dark: [
      "oklch(0.88 0 0)",
      "oklch(0.26 0 0)",
      "oklch(0.16 0 0)",
      "oklch(0.70 0 0)",
    ],
  },
  balanced: anchors(
    {
      brand: {
        base: "oklch(0.28 0 0)",
        foreground: "oklch(0.99 0 0)",
        ring: "oklch(0.50 0 0)",
      },
      secondary: { base: "oklch(0.96 0 0)", foreground: "oklch(0.30 0 0)" },
      accent: { base: "oklch(0.91 0 0)", foreground: "oklch(0.22 0 0)" },
      neutral: {
        background: "oklch(0.97 0 0)",
        foreground: "oklch(0.20 0 0)",
        card: "oklch(1 0 0)",
        cardForeground: "oklch(0.20 0 0)",
        popover: "oklch(1 0 0)",
        popoverForeground: "oklch(0.20 0 0)",
        muted: "oklch(0.96 0 0)",
        mutedForeground: "oklch(0.50 0 0)",
        border: "oklch(0.86 0 0)",
        input: "oklch(0.86 0 0)",
        sidebar: "oklch(0.95 0 0)",
        sidebarForeground: "oklch(0.20 0 0)",
        sidebarAccent: "oklch(0.91 0 0)",
        sidebarAccentForeground: "oklch(0.22 0 0)",
        sidebarBorder: "oklch(0.86 0 0)",
        sidebarRing: "oklch(0.50 0 0)",
      },
      semantic: {
        destructive: "oklch(0.55 0.18 25)",
        destructiveForeground: "oklch(0.99 0 0)",
        success: "oklch(0.52 0.12 155)",
        successForeground: "oklch(0.99 0 0)",
        warning: "oklch(0.75 0.12 75)",
        warningForeground: "oklch(0.28 0.04 75)",
      },
    },
    {
      brand: {
        base: "oklch(0.88 0 0)",
        foreground: "oklch(0.16 0 0)",
        ring: "oklch(0.70 0 0)",
      },
      secondary: { base: "oklch(0.28 0 0)", foreground: "oklch(0.95 0 0)" },
      accent: { base: "oklch(0.30 0 0)", foreground: "oklch(0.82 0 0)" },
      neutral: {
        background: "oklch(0.16 0 0)",
        foreground: "oklch(0.96 0 0)",
        card: "oklch(0.20 0 0)",
        cardForeground: "oklch(0.96 0 0)",
        popover: "oklch(0.20 0 0)",
        popoverForeground: "oklch(0.96 0 0)",
        muted: "oklch(0.25 0 0)",
        mutedForeground: "oklch(0.68 0 0)",
        border: "oklch(0.32 0 0)",
        input: "oklch(0.32 0 0)",
        sidebar: "oklch(0.20 0 0)",
        sidebarForeground: "oklch(0.96 0 0)",
        sidebarAccent: "oklch(0.30 0 0)",
        sidebarAccentForeground: "oklch(0.82 0 0)",
        sidebarBorder: "oklch(0.32 0 0)",
        sidebarRing: "oklch(0.70 0 0)",
      },
      semantic: {
        destructive: "oklch(0.65 0.14 25)",
        destructiveForeground: "oklch(0.15 0.02 25)",
        success: "oklch(0.70 0.11 155)",
        successForeground: "oklch(0.15 0.02 155)",
        warning: "oklch(0.78 0.10 75)",
        warningForeground: "oklch(0.16 0.02 75)",
      },
    },
  ),
};

export const THEME_PACKS: Record<ThemePackId, ThemePack> = {
  academic: ACADEMIC_PACK,
  midnight: MIDNIGHT_PACK,
  forest: FOREST_PACK,
  "warm-paper": WARM_PAPER_PACK,
  graphite: GRAPHITE_PACK,
};

export function getThemePack(id: ThemePackId): ThemePack {
  return THEME_PACKS[id] ?? THEME_PACKS.academic;
}
