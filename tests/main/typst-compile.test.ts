import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTypstLog } from "../../src/main/compile/typst-log";
import { compileTypst, compileTypstForAgent, typstCompileArgs, typstFormatCompileArgs } from "../../src/main/compile/typst";
import { typstWatchSvgArgs } from "../../src/main/compile/typst-live";
import { resolveTypstBinary } from "../../src/main/compile/typst-binary";
import { latexCompileTool } from "../../src/main/agent/tools/latex";
import type { ToolExecuteContext } from "../../src/main/agent/tool-host";

vi.mock("../../src/main/compile/typst-binary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/main/compile/typst-binary")>();
  return {
    ...actual,
    resolveTypstBinary: vi.fn(actual.resolveTypstBinary),
  };
});

const TYPST_STDERR = `error: expected semicolon
   ┌─ manuscript/main.typ:12:5
   │
12 │ #let x = 1
   │     ^
`;

describe("parseTypstLog", () => {
  it("extracts file, line, and message from Typst stderr", () => {
    const parsed = parseTypstLog(TYPST_STDERR);
    expect(parsed.errors).toEqual([
      { file: "manuscript/main.typ", line: 12, message: "expected semicolon" },
    ]);
    expect(parsed.errorSummary).toContain("expected semicolon");
  });

  it("parses more than one error block", () => {
    const stderr = `error: unknown variable: foo
  ┌─ src/a.typ:3:1
error: expected closing bracket
  ┌─ src/b.typ:8:10
`;
    const parsed = parseTypstLog(stderr);
    expect(parsed.errors).toEqual([
      { file: "src/a.typ", line: 3, message: "unknown variable: foo" },
      { file: "src/b.typ", line: 8, message: "expected closing bracket" },
    ]);
  });

  it("puts the raw stderr in errorSummary when nothing structured is found", () => {
    const stderr = "typst: panicked at 'internal'";
    const parsed = parseTypstLog(stderr);
    expect(parsed.errors).toEqual([]);
    expect(parsed.errorSummary).toBe(stderr);
  });
});

describe("typstCompileArgs", () => {
  it("passes --root as the project directory", () => {
    expect(
      typstCompileArgs(
        "/proj",
        "/proj/manuscript/main.typ",
        "/proj/.workbench/compile/typst/main.pdf",
      ),
    ).toEqual([
      "compile",
      "--root",
      "/proj",
      "/proj/manuscript/main.typ",
      "/proj/.workbench/compile/typst/main.pdf",
    ]);
  });

  it("live SVG watch uses --format svg and the same --root", () => {
    expect(
      typstWatchSvgArgs(
        "/proj",
        "/proj/notes/a.typ",
        "/home/user/.prismnext/typst-live/abcd/a/a-{p}-of-{t}.svg",
      ),
    ).toEqual([
      "watch",
      "--root",
      "/proj",
      "--format",
      "svg",
      "/proj/notes/a.typ",
      "/home/user/.prismnext/typst-live/abcd/a/a-{p}-of-{t}.svg",
    ]);
  });

  it("HTML export opts into the html feature flag", () => {
    expect(
      typstFormatCompileArgs(
        "/proj",
        "/proj/notes/a.typ",
        "/proj/out.html",
        "html",
      ),
    ).toEqual([
      "compile",
      "--root",
      "/proj",
      "--format",
      "html",
      "--features",
      "html",
      "/proj/notes/a.typ",
      "/proj/out.html",
    ]);
  });
});

describe("compileTypst unavailable", () => {
  afterEach(() => {
    vi.mocked(resolveTypstBinary).mockReset();
  });

  it("returns a Typst-specific error without mentioning TeX Live", async () => {
    vi.mocked(resolveTypstBinary).mockResolvedValue({
      available: false,
      path: "/missing/typst",
      bundled: false,
      version: null,
    });
    const root = mkdtempSync(join(tmpdir(), "prism-typst-compile-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeFileSync(join(root, "manuscript", "main.typ"), "= Hi\n", "utf-8");
    const result = await compileTypst(root, "manuscript/main.typ");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Typst was not found/);
    expect(result.error).not.toMatch(/TeX Live|TeXLive|xelatex/i);
  });
});

describe("cross-engine tool hints", () => {
  const ctx = {
    runtimeSessionId: "rt-1",
    tabId: "tab-1",
    turnId: "turn-1",
    toolCallId: "call-1",
    projectRoot: "/tmp/typst-cross",
    permissionMode: "auto",
  } as ToolExecuteContext;

  it("latex-compile tells the model to use typst-compile for .typ", async () => {
    const result = await latexCompileTool.execute({ mainFile: "manuscript/main.typ" }, ctx);
    expect(JSON.stringify(result)).toContain("typst-compile");
  });

  it("typst-compile tells the model to use latex-compile for .tex", async () => {
    const result = await compileTypstForAgent("/tmp/typst-cross", "manuscript/main.tex");
    expect("error" in result && result.error).toContain("latex-compile");
  });
});

describe("compileTypst integration", () => {
  it.skipIf(!process.env.PRISM_TEST_TYPST)("compiles a hello document when PRISM_TEST_TYPST=1", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-typst-int-"));
    mkdirSync(join(root, "manuscript"), { recursive: true });
    writeFileSync(join(root, "manuscript", "main.typ"), "= Hello\n", "utf-8");
    const result = await compileTypst(root, "manuscript/main.typ");
    expect(result.success).toBe(true);
    expect(result.pdfPath).toMatch(/\.workbench\/compile\/typst\/main\.pdf$/);
  });
});

describe("compile IPC dispatches typst at the entry", () => {
  it("does not send .typ through compileLatex", () => {
    const ipc = readFileSync(join(__dirname, "../../src/main/ipc/compile.ts"), "utf8");
    const host = readFileSync(join(__dirname, "../../src/host/compile-handlers.ts"), "utf8");
    const orchestrate = readFileSync(join(__dirname, "../../src/main/compile/orchestrate.ts"), "utf8");
    expect(ipc).toContain("compileEngineFromRelPath");
    expect(ipc).toMatch(/=== ["']typst["']/);
    expect(host).toMatch(/=== ["']typst["']/);
    expect(orchestrate).not.toContain("compileTypst");
  });
});
