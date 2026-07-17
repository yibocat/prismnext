import { describe, it, expect } from "vitest";
import { resolveCompilePdfDiskPath } from "../../src/renderer/stores/compile-store";

describe("resolveCompilePdfDiskPath", () => {
  it("maps manuscript main.tex to .prismnext/compile/main.pdf", () => {
    expect(resolveCompilePdfDiskPath("/proj", "manuscript/main.tex")).toBe(
      "/proj/.prismnext/compile/main.pdf",
    );
  });

  it("uses basename stem for nested paths", () => {
    expect(resolveCompilePdfDiskPath("/proj", "paper/sections/root.tex")).toBe(
      "/proj/.prismnext/compile/root.pdf",
    );
  });

  it("preserves Windows separators when project root uses them", () => {
    expect(resolveCompilePdfDiskPath("C:\\proj", "manuscript\\main.tex")).toBe(
      "C:\\proj\\.prismnext\\compile\\main.pdf",
    );
  });
});
