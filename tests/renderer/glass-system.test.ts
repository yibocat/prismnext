import { describe, expect, it } from "vitest";
import { generateGlassCSS } from "@/lib/theme/glass-system";
import { generateThemeCSS, getDefaultThemeConfig } from "@/lib/theme/theme-generator";

describe("generateGlassCSS", () => {
  it("emits only the left-sidebar hole, never toolbar, content, or body", () => {
    const { root, dark } = generateGlassCSS({ tier: 3 });
    for (const block of [root, dark]) {
      expect(block).toContain("--glass-sidebar-bg:");
      expect(block).toContain("--glass-border:");
      expect(block).not.toContain("--glass-toolbar-bg");
      expect(block).not.toContain("--glass-content-bg");
      expect(block).not.toContain("--glass-body-bg");
    }
  });

  it("uses color-mix against the sidebar token", () => {
    const { root } = generateGlassCSS({ tier: 1 });
    expect(root).toContain("color-mix(in srgb, var(--sidebar)");
    expect(root).not.toContain("color-mix(in srgb, var(--background)");
  });
});

describe("generateThemeCSS glass flag", () => {
  it("omits --glass-* when glass is off (default)", () => {
    const css = generateThemeCSS(getDefaultThemeConfig());
    expect(css).not.toContain("--glass-sidebar-bg");
    expect(css).not.toContain("--glass-toolbar-bg");
  });

  it("injects left-sidebar glass vars when glass is on", () => {
    const css = generateThemeCSS({
      ...getDefaultThemeConfig(),
      glassEffect: true,
      glassIntensity: 3,
    });
    expect(css).toContain("--glass-sidebar-bg:");
    expect(css).not.toContain("--glass-toolbar-bg");
    expect(css).not.toContain("--glass-content-bg");
    expect(css).not.toContain("--glass-body-bg");
  });
});
