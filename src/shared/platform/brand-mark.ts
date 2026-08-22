/**
 * prismnext brand mark — locked variant **A**.
 * Fork ribbon: matched bends, upper over lower, round caps, D2 shadow, no gloss.
 */

export type BrandPaletteId = "p1" | "p2" | "p3" | "p4" | "p5" | "p6";

export type BrandScheme = "light" | "dark";

export type BrandRibbonColors = {
  /** Upper band (drawn on top). */
  primary: string;
  /** Lower band (drawn underneath). */
  secondary: string;
};

/** Default brand palette: Warm Graphite (writing-friendly). */
export const DEFAULT_BRAND_PALETTE: BrandPaletteId = "p5";

/** Human-readable lock note for docs / canvases. */
export const BRAND_MARK_VARIANT = "A";

/**
 * Named colorways. Logo geometry stays fixed; swap these freely.
 * Each entry has light + dark presentation colors (schemes name the *surface*).
 */
export const BRAND_PALETTES: Record<
  BrandPaletteId,
  { label: string; light: BrandRibbonColors; dark: BrandRibbonColors }
> = {
  p1: {
    label: "Slate Dual",
    light: { primary: "#1A1D23", secondary: "#8B929E" },
    dark: { primary: "#F2F4F7", secondary: "#8B929E" },
  },
  p2: {
    label: "Ink + Signal Blue",
    light: { primary: "#1A1D23", secondary: "#3B82F6" },
    dark: { primary: "#F2F4F7", secondary: "#60A5FA" },
  },
  p3: {
    label: "Night Ribbon",
    light: { primary: "#12141A", secondary: "#5B8FD9" },
    dark: { primary: "#F2F4F7", secondary: "#7AA7E8" },
  },
  p4: {
    label: "Academic Teal",
    light: { primary: "#1E2A32", secondary: "#2A9D8F" },
    dark: { primary: "#E8F2F0", secondary: "#3DB8A8" },
  },
  p5: {
    label: "Warm Graphite",
    light: { primary: "#2C2825", secondary: "#C9853E" },
    dark: { primary: "#F5EDE4", secondary: "#E8A85A" },
  },
  p6: {
    label: "Mono + UI Accent",
    light: { primary: "#1A1D23", secondary: "#9AA1AC" },
    dark: { primary: "#F2F4F7", secondary: "#9AA1AC" },
  },
};

/**
 * Variant A path data (viewBox 0 0 64 64).
 * Endpoints keep round caps inside the frame at UI scale.
 */
export const RIBBON_STROKE_WIDTH = 7.2;
export const RIBBON_MARK_SCALE = 1.18;
/** Under-band (paint first). */
export const RIBBON_LOWER_D = "M26 31c4.5 5 7.5 10 12.5 12h15";
/** Over-band (paint second — occludes at the fold). */
export const RIBBON_UPPER_D = "M9 35c10 0 14-1.5 18-5 4.5-4 7-7.5 11-7.5h17";

/** D2 drop-shadow: stronger on dark so it stays visible on deep surfaces. */
export type BrandRibbonShadow = {
  color: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  strokeWidth: number;
};

export const RIBBON_SHADOW_LIGHT: BrandRibbonShadow = {
  color: "#1A1714",
  opacity: 0.45,
  offsetX: 1.4,
  offsetY: 1.9,
  strokeWidth: 7.6,
};

export const RIBBON_SHADOW_DARK: BrandRibbonShadow = {
  color: "#000000",
  opacity: 0.75,
  offsetX: 1.6,
  offsetY: 2.1,
  strokeWidth: 7.6,
};

export function resolveBrandRibbonColors(
  palette: BrandPaletteId = DEFAULT_BRAND_PALETTE,
  scheme: BrandScheme = "light",
): BrandRibbonColors {
  const entry = BRAND_PALETTES[palette] ?? BRAND_PALETTES[DEFAULT_BRAND_PALETTE];
  return scheme === "dark" ? entry.dark : entry.light;
}

export function resolveBrandRibbonShadow(
  scheme: BrandScheme = "light",
): BrandRibbonShadow {
  return scheme === "dark" ? RIBBON_SHADOW_DARK : RIBBON_SHADOW_LIGHT;
}

/**
 * Map next-themes / UI surface → brand scheme.
 * Only explicit "dark" uses the light-on-dark mark; undefined / "light" / other → light.
 */
export function resolveBrandSchemeFromTheme(
  resolvedTheme: string | undefined,
): BrandScheme {
  return resolvedTheme === "dark" ? "dark" : "light";
}
