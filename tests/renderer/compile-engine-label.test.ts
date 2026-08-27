import { describe, expect, it } from "vitest";
import {
  compileEngineIconClass,
  compileEngineTone,
} from "../../src/renderer/lib/tex/compile-engine-label";

describe("compile engine tone", () => {
  it("marks a missing engine as warning, not a faded idle icon", () => {
    expect(compileEngineTone(null)).toBe("checking");
    expect(compileEngineTone({
      tectonic: false,
      texlive: { available: false, engines: [], version: null },
    })).toBe("missing");
    expect(compileEngineIconClass("missing")).toBe("text-warning");
    expect(compileEngineIconClass("ready")).toBe("text-success");
  });
});
