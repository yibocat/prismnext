// lib/theme/font-options.ts
// System font stacks for Appearance → Typography.
// Bundled @fontsource faces were removed — pick any installed family via the system picker.

import { settingsDesktop } from "@/lib/desktop-api/settings";

export type SystemFontEntry = { family: string; monospace: boolean };

let fontsCache: SystemFontEntry[] | null = null;
let fontsPromise: Promise<SystemFontEntry[]> | null = null;

export function getCachedSystemFonts(): SystemFontEntry[] | null {
  return fontsCache;
}

export function listSystemFonts(): Promise<SystemFontEntry[]> {
  if (fontsCache) return Promise.resolve(fontsCache);
  if (!fontsPromise) {
    fontsPromise = settingsDesktop
      .themeListSystemFonts()
      .then((list) => {
        fontsCache = list;
        fontsPromise = null;
        return list;
      })
      .catch((err: unknown) => {
        fontsPromise = null;
        throw err;
      });
  }
  return fontsPromise;
}

export interface FontOption {
  id: string;
  label: string;
  family: string; // CSS font-family value
  category: "sans" | "mono";
}

const CN = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';
const CN_MONO = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", ui-monospace, monospace';

/** Presets only — system stacks with cross-platform + CJK fallbacks. */
export const SANS_FONTS: FontOption[] = [
  {
    id: "system-ui",
    label: "System",
    family: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, ${CN}`,
    category: "sans",
  },
];

export const MONO_FONTS: FontOption[] = [
  {
    id: "system-mono",
    label: "System",
    family: `ui-monospace, "SF Mono", "Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", Menlo, Monaco, monospace, ${CN_MONO}`,
    category: "mono",
  },
];

/** Former curated ids (bundled woff2 / @fontsource). Migrated to system presets. */
const LEGACY_BUNDLED_SANS = new Set([
  "geist-sans",
  "inter",
  "ibm-plex-sans",
  "source-sans-3",
  "dm-sans",
  "plus-jakarta-sans",
]);

const LEGACY_BUNDLED_MONO = new Set([
  "geist-mono",
  "cascadia-code",
  "jetbrains-mono",
  "fira-code",
  "sf-mono",
  "consolas",
  "ibm-plex-mono",
  "source-code-pro",
]);

export function isLegacyBundledFontId(id: string): boolean {
  return LEGACY_BUNDLED_SANS.has(id) || LEGACY_BUNDLED_MONO.has(id);
}

/** Map removed curated ids → system presets. Pass-through for system-* and real family names. */
export function migrateFontValue(
  idOrFamily: string,
  category: "sans" | "mono",
): string {
  if (LEGACY_BUNDLED_SANS.has(idOrFamily)) return "system-ui";
  if (LEGACY_BUNDLED_MONO.has(idOrFamily)) return "system-mono";
  if (!idOrFamily.trim()) {
    return category === "mono" ? "system-mono" : "system-ui";
  }
  return idOrFamily;
}

export function getFontById(id: string): FontOption | undefined {
  return [...SANS_FONTS, ...MONO_FONTS].find((f) => f.id === id);
}

export function getDefaultSansFont(): FontOption {
  return SANS_FONTS[0];
}

export function getDefaultMonoFont(): FontOption {
  return MONO_FONTS[0];
}

/**
 * Resolve a stored Appearance font value to a CSS `font-family` stack.
 * Supports system presets, legacy curated ids (→ system), and raw OS family names.
 */
export function resolveFontCssFamily(
  idOrFamily: string,
  category: "sans" | "mono",
): string {
  const migrated = migrateFontValue(idOrFamily, category);
  const known = getFontById(migrated);
  if (known) return known.family;

  const family = migrated.trim();
  if (!family) {
    return category === "mono"
      ? getDefaultMonoFont().family
      : getDefaultSansFont().family;
  }

  // Quote multi-word / non-ident family names for CSS.
  const quoted = /^[a-zA-Z_][\w-]*$/.test(family)
    ? family
    : `"${family.replace(/"/g, '\\"')}"`;
  return category === "mono" ? `${quoted}, ${CN_MONO}` : `${quoted}, ${CN}`;
}
