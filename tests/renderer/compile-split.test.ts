import { describe, expect, it } from "vitest";
import {
  defaultCompilePreviewOpen,
  resolveCompilePreviewOpen,
} from "../../src/renderer/lib/compile/compile-split";

describe("resolveCompilePreviewOpen", () => {
  it("opens Typst PDF by default and keeps LaTeX editor-first", () => {
    expect(defaultCompilePreviewOpen("manuscript/main.typ")).toBe(true);
    expect(defaultCompilePreviewOpen("manuscript/main.tex")).toBe(false);
    expect(resolveCompilePreviewOpen(undefined, "a.typ")).toBe(true);
    expect(resolveCompilePreviewOpen(undefined, "a.tex")).toBe(false);
    expect(resolveCompilePreviewOpen(false, "a.typ")).toBe(false);
    expect(resolveCompilePreviewOpen(true, "a.tex")).toBe(true);
  });
});
