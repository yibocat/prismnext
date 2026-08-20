import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp",
  },
}));

import { oneLineError, tectonicEngineId } from "../../src/main/services/compiler";

describe("compile log helpers", () => {
  it("oneLineError keeps the first non-empty line", () => {
    expect(oneLineError("\n! Undefined control sequence.\nrest of log")).toBe(
      "! Undefined control sequence.",
    );
  });

  it("oneLineError truncates long lines and never dumps a full TeX log", () => {
    const long = `! ${"x".repeat(400)}`;
    const line = oneLineError(long, 40);
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line.endsWith("…")).toBe(true);
  });

  it("tectonicEngineId distinguishes bundled vs system", () => {
    expect(tectonicEngineId(true)).toBe("tectonic-bundled");
    expect(tectonicEngineId(false)).toBe("tectonic-system");
  });
});
