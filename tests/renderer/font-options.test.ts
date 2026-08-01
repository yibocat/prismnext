import { describe, expect, it } from "vitest";
import {
  migrateFontValue,
  resolveFontCssFamily,
} from "@/lib/theme/font-options";

describe("font-options", () => {
  it("migrates removed bundled ids to system presets", () => {
    expect(migrateFontValue("geist-sans", "sans")).toBe("system-ui");
    expect(migrateFontValue("inter", "sans")).toBe("system-ui");
    expect(migrateFontValue("jetbrains-mono", "mono")).toBe("system-mono");
  });

  it("resolves system stacks and quoted family names", () => {
    expect(resolveFontCssFamily("system-ui", "sans")).toContain("system-ui");
    expect(resolveFontCssFamily("system-mono", "mono")).toContain("ui-monospace");
    expect(resolveFontCssFamily("Segoe UI", "sans")).toMatch(/^"Segoe UI"/);
    expect(resolveFontCssFamily("Menlo", "mono")).toMatch(/^Menlo,/);
  });
});
