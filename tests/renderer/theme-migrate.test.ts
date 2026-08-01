import { describe, expect, it } from "vitest";
import { migrateToThemePackConfig } from "@/lib/theme/theme-migrate";

describe("migrateToThemePackConfig", () => {
  it("maps blue primary to academic", () => {
    const out = migrateToThemePackConfig({
      primaryColor: "blue",
      baseIntensity: 0.35,
      radius: 0.525,
    });
    expect(out.themePack).toBe("academic");
  });

  it("maps mono to graphite", () => {
    const out = migrateToThemePackConfig({ primaryColor: "mono", baseIntensity: 0.1 });
    expect(out.themePack).toBe("graphite");
  });

  it("maps violet to midnight", () => {
    const out = migrateToThemePackConfig({
      primaryColor: "violet",
      baseIntensity: 0.7,
    });
    expect(out.themePack).toBe("midnight");
  });

  it("passthrough new shape", () => {
    const out = migrateToThemePackConfig({
      themePack: "forest",
      radius: 0.775,
      fontSans: "system-ui",
      fontMono: "system-mono",
      uiFontSize: "16px",
      editorFontFamily: "system-mono",
      editorFontSize: "13px",
      glassEffect: false,
      glassIntensity: 3,
    });
    expect(out.themePack).toBe("forest");
    expect(out.radius).toBe(0.775);
  });

  it("maps legacy bundled font ids to system presets", () => {
    const out = migrateToThemePackConfig({
      themePack: "academic",
      fontSans: "geist-sans",
      fontMono: "jetbrains-mono",
      editorFontFamily: "fira-code",
    });
    expect(out.fontSans).toBe("system-ui");
    expect(out.fontMono).toBe("system-mono");
    expect(out.editorFontFamily).toBe("system-mono");
  });

  it("keeps raw system family names", () => {
    const out = migrateToThemePackConfig({
      themePack: "academic",
      fontSans: "Helvetica Neue",
      editorFontFamily: "Menlo",
    });
    expect(out.fontSans).toBe("Helvetica Neue");
    expect(out.editorFontFamily).toBe("Menlo");
  });
});
