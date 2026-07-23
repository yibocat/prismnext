import { describe, expect, it } from "vitest";
import { parseOklch, formatOklch, clampChroma } from "@/lib/theme/oklch";

describe("oklch", () => {
  it("parses oklch with optional alpha", () => {
    expect(parseOklch("oklch(0.55 0.18 250)")).toEqual({
      l: 0.55,
      c: 0.18,
      h: 250,
    });
    expect(parseOklch("oklch(1 0 0 / 18%)")).toEqual({
      l: 1,
      c: 0,
      h: 0,
      alpha: 0.18,
    });
  });

  it("round-trips format", () => {
    const s = formatOklch({ l: 0.55, c: 0.18, h: 250 });
    expect(s).toBe("oklch(0.550 0.1800 250)");
    expect(parseOklch(s)).toMatchObject({ l: 0.55, c: 0.18, h: 250 });
  });

  it("formats alpha as percent", () => {
    expect(formatOklch({ l: 1, c: 0, h: 0, alpha: 0.18 })).toBe(
      "oklch(1.000 0.0000 0 / 18%)",
    );
  });

  it("clamps chroma", () => {
    expect(clampChroma(-0.1)).toBe(0);
    expect(clampChroma(0.5)).toBe(0.4);
  });
});
