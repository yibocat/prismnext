// lib/theme/theme-migrate.ts
// Migrate legacy primaryColor / baseIntensity configs to theme packs.
// Intensity was removed - legacy baseIntensity is ignored.

import {
  getDefaultThemeConfig,
  type ThemeConfig,
} from "./theme-generator";
import { migrateFontValue } from "./font-options";
import { THEME_PACK_IDS, type ThemePackId } from "./theme-packs";
import type { GlassTier } from "./glass-system";

const PRIMARY_TO_PACK: Record<string, ThemePackId> = {
  blue: "academic",
  teal: "academic",
  violet: "midnight",
  green: "forest",
  amber: "warm-paper",
  rose: "warm-paper",
  mono: "graphite",
  "academic-blue": "academic",
  "ink-green": "forest",
};

function isThemePackId(v: unknown): v is ThemePackId {
  return typeof v === "string" && (THEME_PACK_IDS as string[]).includes(v);
}

function resolvePack(raw: Record<string, unknown>): ThemePackId {
  if (isThemePackId(raw.themePack)) return raw.themePack;

  if (typeof raw.primaryColor === "string") {
    return PRIMARY_TO_PACK[raw.primaryColor] ?? "academic";
  }

  if (typeof raw.themeColor === "string") {
    return PRIMARY_TO_PACK[raw.themeColor] ?? "academic";
  }

  return "academic";
}

export function migrateToThemePackConfig(
  raw: Record<string, unknown>,
): ThemeConfig {
  const defaults = getDefaultThemeConfig();

  return {
    themePack: resolvePack(raw),
    radius: typeof raw.radius === "number" ? raw.radius : defaults.radius,
    fontSans:
      typeof raw.fontSans === "string"
        ? migrateFontValue(raw.fontSans, "sans")
        : defaults.fontSans,
    fontMono:
      typeof raw.fontMono === "string"
        ? migrateFontValue(raw.fontMono, "mono")
        : defaults.fontMono,
    uiFontSize:
      typeof raw.uiFontSize === "string" ? raw.uiFontSize : defaults.uiFontSize,
    editorFontFamily:
      typeof raw.editorFontFamily === "string"
        ? migrateFontValue(raw.editorFontFamily, "mono")
        : defaults.editorFontFamily,
    editorFontSize:
      typeof raw.editorFontSize === "string"
        ? raw.editorFontSize
        : defaults.editorFontSize,
    glassEffect:
      typeof raw.glassEffect === "boolean" ? raw.glassEffect : defaults.glassEffect,
    glassIntensity:
      typeof raw.glassIntensity === "number"
        ? (raw.glassIntensity as GlassTier)
        : defaults.glassIntensity,
  };
}
