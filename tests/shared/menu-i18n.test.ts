import { describe, expect, it } from "vitest";
import { menuStrings } from "../../src/shared/platform/menu-i18n";

describe("menuStrings developer Help items", () => {
  it("exposes Help → Developer labels in every locale", () => {
    for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
      const t = menuStrings(locale);
      expect(t.help.length).toBeGreaterThan(0);
      expect(t.developer.length).toBeGreaterThan(0);
      expect(t.showFullPromptText.length).toBeGreaterThan(0);
    }
  });
});
