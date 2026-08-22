import { describe, expect, it } from "vitest";
import {
  normalizeAppLocalePreference,
  resolveAppLocale,
} from "../../src/shared/platform/app-locale";

describe("app-locale", () => {
  it("normalizes unknown and legacy system to en", () => {
    expect(normalizeAppLocalePreference(undefined)).toBe("en");
    expect(normalizeAppLocalePreference("fr")).toBe("en");
    expect(normalizeAppLocalePreference("system")).toBe("en");
    expect(normalizeAppLocalePreference("zh-CN")).toBe("zh-CN");
    expect(normalizeAppLocalePreference("zh-HK")).toBe("zh-HK");
    expect(normalizeAppLocalePreference("en")).toBe("en");
  });

  it("resolves explicit preferences", () => {
    expect(resolveAppLocale("en", "zh-CN")).toBe("en");
    expect(resolveAppLocale("zh-CN", "en-US")).toBe("zh-CN");
    expect(resolveAppLocale("zh-HK", "en-US")).toBe("zh-HK");
    expect(resolveAppLocale("system" as never, "zh-CN")).toBe("en");
  });
});
