import { describe, it, expect } from "vitest";
import { normalizeLibraryCiteMarkers } from "../../src/shared/normalize-library-cite-markers";

describe("normalizeLibraryCiteMarkers", () => {
  it("canonicalizes whitespace inside bracketed cites", () => {
    expect(normalizeLibraryCiteMarkers("See [ @ smith2024 ] and [@foo:bar_1]")).toBe(
      "See [@smith2024] and [@foo:bar_1]",
    );
  });

  it("leaves already canonical cites unchanged", () => {
    const text = "Use [@smith2024] and [@foo:bar_1].";
    expect(normalizeLibraryCiteMarkers(text)).toBe(text);
  });

  it("skips work when no @ present", () => {
    expect(normalizeLibraryCiteMarkers("plain text")).toBe("plain text");
  });
});
