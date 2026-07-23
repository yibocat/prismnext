import { describe, expect, it } from "vitest";
import { generateThemeCSS, getDefaultThemeConfig } from "@/lib/theme/theme-generator";
import { THEME_PACK_IDS } from "@/lib/theme/theme-packs";

describe("generateThemeCSS", () => {
  it("emits semantic and distinct accent for academic", () => {
    const css = generateThemeCSS(getDefaultThemeConfig());
    expect(css).toContain("--destructive:");
    expect(css).toContain("--success:");
    expect(css).toContain("--warning:");
    const root = css.split(".dark")[0];
    const accent = root.match(/--accent:\s*([^;]+);/)?.[1]?.trim();
    const muted = root.match(/--muted:\s*([^;]+);/)?.[1]?.trim();
    expect(accent).toBeTruthy();
    expect(muted).toBeTruthy();
    expect(accent).not.toBe(muted);
  });

  it("defaults to academic", () => {
    const d = getDefaultThemeConfig();
    expect(d.themePack).toBe("academic");
  });

  it("binds editor to card and pdf well to muted", () => {
    const css = generateThemeCSS(getDefaultThemeConfig());
    const root = css.split(".dark")[0];
    const card = root.match(/--card:\s*([^;]+);/)?.[1]?.trim();
    const muted = root.match(/--muted:\s*([^;]+);/)?.[1]?.trim();
    const editorBg = root.match(/--editor-bg:\s*([^;]+);/)?.[1]?.trim();
    const pdf = root.match(/--pdf-canvas:\s*([^;]+);/)?.[1]?.trim();
    expect(editorBg).toBe(card);
    expect(pdf).toBe(muted);
  });

  it("every pack generates valid CSS with all chart vars (light + dark)", () => {
    const base = getDefaultThemeConfig();
    for (const id of THEME_PACK_IDS) {
      const css = generateThemeCSS({ ...base, themePack: id });
      const root = css.split(".dark")[0];
      const dark = css.split(".dark")[1] ?? "";
      for (const k of ["--background", "--primary", "--accent", "--sidebar-accent"]) {
        expect(root, `${id} light missing ${k}`).toContain(`${k}:`);
      }
      for (let i = 1; i <= 5; i++) {
        expect(root, `${id} light missing --chart-${i}`).toContain(`--chart-${i}:`);
        expect(dark, `${id} dark missing --chart-${i}`).toContain(`--chart-${i}:`);
      }
    }
  });
});

