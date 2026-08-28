import { describe, expect, it } from "vitest";
import { isTypstStandaloneRel, resolveTypstRootFromBuffers } from "../../src/renderer/lib/typst/resolve-typst-root";

describe("resolveTypstRootFromBuffers", () => {
  const files = [
    { relativePath: "manuscript/chapter.typ" },
    { relativePath: "manuscript/main.typ" },
    { relativePath: "notes/scratch.typ" },
  ];
  const contents: Record<string, string> = {
    "manuscript/chapter.typ": "// !typst root = main.typ\n= Ch\n",
    "manuscript/main.typ": "= Paper\n",
    "notes/scratch.typ": "= Scratch\n",
  };

  it("follows magic comments on open buffers without walking disk", () => {
    expect(
      resolveTypstRootFromBuffers({
        files,
        getContent: (rel) => contents[rel] ?? "",
        manuscriptDir: "manuscript",
        mainFilePin: "main.tex",
        hintRel: "manuscript/chapter.typ",
      }),
    ).toBe("manuscript/main.typ");
  });

  it("uses manuscript/main.typ when listed", () => {
    expect(
      resolveTypstRootFromBuffers({
        files,
        getContent: (rel) => contents[rel] ?? "",
        manuscriptDir: "manuscript",
        mainFilePin: "main.tex",
        hintRel: null,
      }),
    ).toBe("manuscript/main.typ");
  });
});

describe("isTypstStandaloneRel (renderer)", () => {
  it("matches the main-process rule", () => {
    expect(isTypstStandaloneRel("notes/a.typ", "manuscript")).toBe(true);
    expect(isTypstStandaloneRel("manuscript/main.typ", "manuscript")).toBe(false);
  });
});
