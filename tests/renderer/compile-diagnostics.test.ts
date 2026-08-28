import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileArtifactCacheKey } from "../../src/shared/compile/artifact-key";
import { useDocumentStore } from "../../src/renderer/stores/document-store";
import {
  aiAutoCompilePauseCountForTests,
  clearPdfCache,
  isAutoCompileEnabled,
  pauseAutoCompileForAi,
  resetAiAutoCompilePauseForTests,
  resumeAutoCompileAfterAi,
  setCompileDiagnosticsForKey,
  useCompileStore,
} from "../../src/renderer/stores/compile-store";
import { compileProblemListId, problemsFromDiagnostics, shouldShowCompileProblemsStrip } from "../../src/renderer/lib/compile/compile-problems-strip";

describe("AI auto-compile pause", () => {
  beforeEach(() => {
    resetAiAutoCompilePauseForTests();
    useDocumentStore.setState({ projectRoot: "/p" });
    useCompileStore.setState({
      autoCompile: true,
      autoCompileByRoot: {},
      localAutoCompileDefault: true,
    });
  });

  afterEach(() => {
    resetAiAutoCompilePauseForTests();
  });

  it("disables auto-compile while a chat turn is in flight", () => {
    expect(isAutoCompileEnabled()).toBe(true);
    pauseAutoCompileForAi("tab-a");
    expect(isAutoCompileEnabled()).toBe(false);
    expect(aiAutoCompilePauseCountForTests()).toBe(1);
    resumeAutoCompileAfterAi("tab-a");
    expect(aiAutoCompilePauseCountForTests()).toBe(0);
    expect(isAutoCompileEnabled()).toBe(true);
  });

  it("is idempotent for the same chat tab", () => {
    pauseAutoCompileForAi("tab-a");
    pauseAutoCompileForAi("tab-a");
    expect(aiAutoCompilePauseCountForTests()).toBe(1);
    resumeAutoCompileAfterAi("tab-a");
    expect(aiAutoCompilePauseCountForTests()).toBe(0);
    resumeAutoCompileAfterAi("tab-a");
    expect(aiAutoCompilePauseCountForTests()).toBe(0);
  });

  it("nests across concurrent chat tabs", () => {
    pauseAutoCompileForAi("tab-a");
    pauseAutoCompileForAi("tab-b");
    expect(aiAutoCompilePauseCountForTests()).toBe(2);
    resumeAutoCompileAfterAi("tab-a");
    expect(isAutoCompileEnabled()).toBe(false);
    resumeAutoCompileAfterAi("tab-b");
    expect(isAutoCompileEnabled()).toBe(true);
  });
});

describe("compile diagnostics by artifact key", () => {
  afterEach(() => {
    useCompileStore.setState({ diagnosticsByKey: {} });
  });

  const latex = {
    projectRoot: "/p",
    engine: "latex" as const,
    route: "paper" as const,
    compileRoot: "manuscript/main.tex",
  };
  const typst = {
    projectRoot: "/p",
    engine: "typst" as const,
    route: "paper" as const,
    compileRoot: "manuscript/main.typ",
  };

  it("keeps latex and typst failures on separate keys", () => {
    setCompileDiagnosticsForKey(latex, {
      error: "tex fail",
      log: null,
      structuredErrors: [{ message: "tex fail", severity: "error" }],
    });
    setCompileDiagnosticsForKey(typst, {
      error: "typ fail",
      log: null,
      structuredErrors: [{ message: "typ fail", severity: "error" }],
    });
    const byKey = useCompileStore.getState().diagnosticsByKey;
    expect(byKey[compileArtifactCacheKey(latex)]?.error).toBe("tex fail");
    expect(byKey[compileArtifactCacheKey(typst)]?.error).toBe("typ fail");
  });

  it("does not invent problems after a successful compile", () => {
    expect(problemsFromDiagnostics({
      error: null,
      log: "! leftover\nl.1",
      structuredErrors: [],
    }, "latex")).toEqual([]);
  });

  it("lists structured errors for the Files strip", () => {
    const problems = problemsFromDiagnostics({
      error: "failed",
      log: null,
      structuredErrors: [{
        file: "manuscript/main.typ",
        line: 12,
        message: "expected semicolon",
        severity: "error",
      }],
    }, "typst");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: "manuscript/main.typ",
      line: 12,
      message: "expected semicolon",
      severity: "error",
    });
  });

  it("clearPdfCache drops per-key diagnostics", () => {
    setCompileDiagnosticsForKey(latex, {
      error: "stale",
      log: "log",
      structuredErrors: [{ message: "stale", severity: "error" }],
    });
    clearPdfCache();
    expect(useCompileStore.getState().diagnosticsByKey).toEqual({});
  });

  it("gives unique list ids when Typst repeats file:line:message", () => {
    const a = { file: "draft.typ", line: 66, message: "the character `、` is not valid in code" };
    expect(compileProblemListId(a, 0)).not.toBe(compileProblemListId(a, 1));
    const problems = problemsFromDiagnostics({
      error: "fail",
      log: null,
      structuredErrors: [
        { ...a, severity: "error" },
        { ...a, severity: "error" },
      ],
    }, "typst");
    expect(new Set(problems.map((p) => p.id)).size).toBe(2);
  });
});

describe("shouldShowCompileProblemsStrip", () => {
  it("stays hidden while compiling a clean document", () => {
    expect(shouldShowCompileProblemsStrip(0)).toBe(false);
    expect(shouldShowCompileProblemsStrip(1)).toBe(true);
  });
});
