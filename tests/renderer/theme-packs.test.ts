import { describe, expect, it } from "vitest";
import { THEME_PACK_IDS, getThemePack, type ThemePackId } from "@/lib/theme/theme-packs";
import { parseOklch } from "@/lib/theme/oklch";

function hueDelta(a: number, b: number): number {
  return Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
}

// Graphite is the mono pack - special-cased everywhere below.
const CHROMATIC: ThemePackId[] = ["academic", "midnight", "forest", "warm-paper"];

describe("theme-packs", () => {
  it("lists five pack ids", () => {
    expect(THEME_PACK_IDS).toEqual([
      "academic",
      "midnight",
      "forest",
      "warm-paper",
      "graphite",
    ]);
  });

  it("academic anchors are well-formed", () => {
    const pack = getThemePack("academic");
    expect(pack.balanced.light.brand.base).toMatch(/^oklch\(/);
    expect(pack.swatches.light).toHaveLength(4);
  });

  it("packs use distinct brand hues", () => {
    const hues = THEME_PACK_IDS.map((id) => {
      const b = parseOklch(getThemePack(id).balanced.light.brand.base);
      return b!.h;
    });
    expect(new Set(hues.map((h) => Math.round(h / 10))).size).toBeGreaterThanOrEqual(4);
  });

  it("each chromatic pack has a real companion accent (not gray)", () => {
    for (const id of CHROMATIC) {
      for (const anchors of [
        getThemePack(id).balanced.light,
        getThemePack(id).balanced.dark,
      ]) {
        const brand = parseOklch(anchors.brand.base)!;
        const accent = parseOklch(anchors.accent.base)!;
        const secondary = parseOklch(anchors.secondary.base)!;
        const muted = parseOklch(anchors.neutral.muted)!;

        // accent is a soft tint - not gray, not loud
        expect(accent.c).toBeGreaterThan(0.02);
        expect(accent.c).toBeLessThan(0.06);
        // companion hue differs from brand
        expect(hueDelta(accent.h, brand.h)).toBeGreaterThan(60);
        // accent is distinct from muted (different hue)
        expect(hueDelta(accent.h, muted.h)).toBeGreaterThan(40);
        // secondary is a brand-family tint (same hue as brand), distinct from accent
        expect(hueDelta(secondary.h, brand.h)).toBeLessThan(30);
        expect(hueDelta(secondary.h, accent.h)).toBeGreaterThan(40);
        // brand is the one loud color
        expect(brand.c).toBeGreaterThan(0.1);
        expect(brand.c).toBeGreaterThan(accent.c);
      }
    }
  });

  it("sidebar selection follows the companion accent", () => {
    for (const id of CHROMATIC) {
      const light = getThemePack(id).balanced.light;
      expect(light.neutral.sidebarAccent).toBe(light.accent.base);
      expect(light.neutral.sidebarAccentForeground).toBe(light.accent.foreground);
    }
  });

  it("gallery lift: white card on a quieter canvas", () => {
    for (const id of CHROMATIC) {
      const light = getThemePack(id).balanced.light;
      const bg = parseOklch(light.neutral.background)!;
      const card = parseOklch(light.neutral.card)!;
      expect(card.l).toBeGreaterThanOrEqual(0.99);
      expect(bg.l).toBeLessThan(card.l);
      expect(bg.c).toBeLessThan(0.012);
    }
  });

  it("graphite is pure grayscale - no companion hue anywhere", () => {
    for (const anchors of [
      getThemePack("graphite").balanced.light,
      getThemePack("graphite").balanced.dark,
    ]) {
      expect(parseOklch(anchors.neutral.background)!.c).toBe(0);
      expect(parseOklch(anchors.neutral.muted)!.c).toBe(0);
      expect(parseOklch(anchors.accent.base)!.c).toBe(0);
      expect(parseOklch(anchors.secondary.base)!.c).toBe(0);
      expect(parseOklch(anchors.brand.base)!.c).toBe(0);
      // selection still has a lightness step (not flat)
      const sidebar = parseOklch(anchors.neutral.sidebar)!;
      const accent = parseOklch(anchors.accent.base)!;
      expect(Math.abs(accent.l - sidebar.l)).toBeGreaterThan(0.02);
    }
  });

  it("each pack has a 5-color chart for light and dark", () => {
    for (const id of THEME_PACK_IDS) {
      const pack = getThemePack(id);
      expect(pack.chart.light).toHaveLength(5);
      expect(pack.chart.dark).toHaveLength(5);
      for (const c of pack.chart.light) expect(c).toMatch(/^oklch\(/);
      for (const c of pack.chart.dark) expect(c).toMatch(/^oklch\(/);
    }
  });

  it("accent hue is the expected companion per pack", () => {
    const expected: Record<string, number> = {
      academic: 75,
      midnight: 190,
      forest: 90,
      "warm-paper": 185,
    };
    for (const id of Object.keys(expected) as ThemePackId[]) {
      const accent = parseOklch(getThemePack(id).balanced.light.accent.base)!;
      expect(hueDelta(accent.h, expected[id])).toBeLessThan(15);
    }
  });
});
