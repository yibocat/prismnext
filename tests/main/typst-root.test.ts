import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  isTypstStandaloneRel,
  parseTypstRootMagicComment,
  resolveTypstRoot,
} from "../../src/main/lib/typst-root";

function writeWorkbench(root: string, folders: unknown[]): void {
  mkdirSync(join(root, ".workbench"), { recursive: true });
  writeFileSync(
    join(root, ".workbench", "workbench.json"),
    JSON.stringify({
      id: "p_typst",
      workspace: { folders },
    }),
    "utf-8",
  );
}

describe("parseTypstRootMagicComment", () => {
  it("reads // !typst root from the first 20 lines", () => {
    const content = [
      "// header",
      "// !typst root = manuscript/main.typ",
      "#let x = 1",
    ].join("\n");
    expect(parseTypstRootMagicComment(content)).toBe("manuscript/main.typ");
  });

  it("ignores comments after line 20", () => {
    const lines = Array.from({ length: 21 }, (_, i) =>
      i === 20 ? "// !typst root = late.typ" : "// pad",
    );
    expect(parseTypstRootMagicComment(lines.join("\n"))).toBeNull();
  });
});

describe("isTypstStandaloneRel", () => {
  it("treats non-main/paper files as standalone when manuscriptDir is empty", () => {
    expect(isTypstStandaloneRel("notes/a.typ", null)).toBe(true);
    expect(isTypstStandaloneRel("main.typ", null)).toBe(false);
    expect(isTypstStandaloneRel("paper.typ", null)).toBe(false);
  });

  it("treats files outside the manuscript prefix as standalone", () => {
    expect(isTypstStandaloneRel("notes/a.typ", "manuscript")).toBe(true);
    expect(isTypstStandaloneRel("manuscript/main.typ", "manuscript")).toBe(false);
    expect(isTypstStandaloneRel("manuscript/intro.typ", "manuscript")).toBe(false);
  });
});

describe("resolveTypstRoot", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-typst-root-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("uses an existing hint .typ", () => {
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }]);
    writeFileSync(join(root, "manuscript", "alt.typ"), "= Alt\n", "utf-8");
    const resolved = resolveTypstRoot(root, "manuscript/alt.typ");
    expect(resolved?.mainFile).toBe("manuscript/alt.typ");
    expect(resolved?.resolution).toBe("hint");
    expect(resolved?.buildDir).toBe(".workbench/compile/typst");
  });

  it("follows // !typst root from the hint file", () => {
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }]);
    writeFileSync(join(root, "manuscript", "main.typ"), "= Paper\n", "utf-8");
    writeFileSync(
      join(root, "manuscript", "chapter.typ"),
      "// !typst root = main.typ\n= Ch\n",
      "utf-8",
    );
    const resolved = resolveTypstRoot(root, "manuscript/chapter.typ");
    expect(resolved?.mainFile).toBe("manuscript/main.typ");
    expect(resolved?.resolution).toBe("magic-root");
  });

  it("uses workspace pin when it ends with .typ", () => {
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.typ" }]);
    writeFileSync(join(root, "manuscript", "main.typ"), "= Pin\n", "utf-8");
    const resolved = resolveTypstRoot(root);
    expect(resolved?.mainFile).toBe("manuscript/main.typ");
    expect(resolved?.resolution).toBe("workspace-config");
    expect(resolved?.manuscriptFolder).toBe("manuscript");
  });

  it("falls back to manuscript/main.typ then paper.typ", () => {
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }]);
    writeFileSync(join(root, "manuscript", "paper.typ"), "= Paper\n", "utf-8");
    const resolved = resolveTypstRoot(root);
    expect(resolved?.mainFile).toBe("manuscript/paper.typ");
    expect(resolved?.resolution).toBe("paper.typ");
  });

  it("picks the first .typ in the manuscript folder", () => {
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }]);
    writeFileSync(join(root, "manuscript", "zeta.typ"), "= Z\n", "utf-8");
    writeFileSync(join(root, "manuscript", "alpha.typ"), "= A\n", "utf-8");
    const resolved = resolveTypstRoot(root);
    expect(resolved?.mainFile).toBe("manuscript/alpha.typ");
    expect(resolved?.resolution).toBe("first-typ-in-manuscript");
  });

  it("falls back to project-root main.typ", () => {
    writeWorkbench(root, [{ name: "manuscript", function: "manuscript", mainTex: "main.tex" }]);
    writeFileSync(join(root, "main.typ"), "= Root\n", "utf-8");
    const resolved = resolveTypstRoot(root);
    expect(resolved?.mainFile).toBe("main.typ");
    expect(resolved?.resolution).toBe("root-main.typ");
  });
});
