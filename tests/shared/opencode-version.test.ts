import { describe, expect, it } from "vitest";
import {
  openCodeVersionAtLeast,
  parseOpencodeVersionOutput,
  shouldSkipEffortVariantConfigSync,
} from "../../src/shared/opencode-version";

describe("opencode-version", () => {
  it("parses semver", () => {
    expect(parseOpencodeVersionOutput("1.18.10\n")).toBe("1.18.10");
  });

  it("openCodeVersionAtLeast compares patch levels", () => {
    expect(openCodeVersionAtLeast("1.18.10", "1.18.0")).toBe(true);
    expect(openCodeVersionAtLeast("1.17.7", "1.18.0")).toBe(false);
    expect(openCodeVersionAtLeast("1.18.0", "1.18.0")).toBe(true);
  });

  it("shouldSkipEffortVariantConfigSync from 1.18.0", () => {
    expect(shouldSkipEffortVariantConfigSync("1.18.10")).toBe(true);
    expect(shouldSkipEffortVariantConfigSync("1.17.7")).toBe(false);
    expect(shouldSkipEffortVariantConfigSync(null)).toBe(false);
  });
});
