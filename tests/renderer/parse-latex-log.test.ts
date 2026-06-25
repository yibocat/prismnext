import { describe, expect, it } from "vitest";
import { hasCompileProblems, parseLatexLog } from "@/modes/texworkspace-mode/parse-latex-log";

describe("parseLatexLog", () => {
  it("parses classic ! error with l.N line reference", () => {
    const log = [
      "! Undefined control sequence.",
      "l.42 \\badcommand",
      "      here",
    ].join("\n");

    const problems = parseLatexLog(log);
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("error");
    expect(problems[0].line).toBe(42);
    expect(problems[0].message).toContain("Undefined control sequence");
  });

  it("parses file:line error lines", () => {
    const log = "main.tex:12: error: Missing \\begin{document}";
    const problems = parseLatexLog(log);
    expect(problems[0].file).toBe("main.tex");
    expect(problems[0].line).toBe(12);
  });

  it("parses LaTeX Warning lines", () => {
    const log = "LaTeX Warning: Reference `fig:missing' on input line 88.";
    const problems = parseLatexLog(log);
    expect(problems[0].severity).toBe("warning");
    expect(problems[0].line).toBe(88);
  });

  it("returns empty for blank log", () => {
    expect(parseLatexLog("")).toEqual([]);
    expect(parseLatexLog(null)).toEqual([]);
  });

  it("detects compile failure for toolbar button", () => {
    expect(hasCompileProblems("Build failed", null)).toBe(true);
    expect(hasCompileProblems(null, "")).toBe(false);
  });
});
