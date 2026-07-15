import { describe, expect, it } from "vitest";
import {
  codeSnippetLabel,
  contextInsertToPart,
  legacyTerminalRequest,
} from "@/lib/chat/context-insert";
import { offsetToLineCol } from "@/lib/editor/selection-anchor";

describe("contextInsertToPart", () => {
  it("builds terminal snippet part", () => {
    const part = contextInsertToPart(
      legacyTerminalRequest({
        command: "pnpm test",
        output: "ok",
        cwd: "/tmp",
        exitCode: 0,
        sourceTabId: "t1",
      }),
    );
    expect(part.type).toBe("terminal-snippet");
    if (part.type !== "terminal-snippet") return;
    expect(part.command).toBe("pnpm test");
    expect(part.output).toBe("ok");
    expect(part.cwd).toBe("/tmp");
    expect(part.exitCode).toBe(0);
    expect(part.label).toContain("pnpm test");
  });

  it("builds code snippet part with line label", () => {
    const part = contextInsertToPart({
      kind: "code",
      filePath: "src/main.ts",
      fileId: "f1",
      text: "hello",
      startLine: 3,
      endLine: 5,
      source: "editor",
      sourceTabId: "tab-1",
    });
    expect(part.type).toBe("code-snippet");
    if (part.type !== "code-snippet") return;
    expect(part.label).toBe("main.ts:3-5");
    expect(part.text).toBe("hello");
    expect(part.fileId).toBe("f1");
  });

  it("builds git diff snippet part with tooltip", () => {
    const part = contextInsertToPart({
      kind: "git-diff",
      filePath: "src/foo.ts",
      layout: "unified",
      removedLineCount: 2,
      addedLineCount: 1,
      hunks: [
        {
          oldStartLine: 1,
          oldLineCount: 2,
          newStartLine: 1,
          newLineCount: 2,
          lines: ["-old", "+new"],
        },
      ],
    });
    expect(part.type).toBe("git-diff-snippet");
    if (part.type !== "git-diff-snippet") return;
    expect(part.label).toBe("foo.ts:1-2");
    expect(part.title).toBe("含 2 行删除 + 1 行新增");
    expect(part.layout).toBe("unified");
  });

  it("builds experiment-run part carrying command + artifact context", () => {
    const part = contextInsertToPart({
      kind: "experiment-run",
      runId: "run-20260707-120000-a1b2",
      experimentId: "exp-test",
      command: "python train.py --lr 0.001",
      exitCode: 0,
      startedAt: "2026-07-07T12:00:00.000Z",
      finishedAt: "2026-07-07T12:00:05.000Z",
      artifactPath: "experiment/exp-test/plot.png",
      linkMethod: "explicit",
      artifacts: ["experiment/exp-test/plot.png", "experiment/exp-test/metrics.csv"],
      env: { python: "/usr/bin/python3", pythonVersion: "3.12", platform: "darwin", gitCommit: "abc1234" },
      chatSessionId: "ses_x",
      workspacePath: "experiment/exp-test",
    });
    expect(part.type).toBe("experiment-run");
    if (part.type !== "experiment-run") return;
    expect(part.runId).toBe("run-20260707-120000-a1b2");
    expect(part.command).toBe("python train.py --lr 0.001");
    expect(part.exitCode).toBe(0);
    expect(part.artifactPath).toBe("experiment/exp-test/plot.png");
    expect(part.linkMethod).toBe("explicit");
    expect(part.artifacts).toHaveLength(2);
    expect(part.chatSessionId).toBe("ses_x");
    expect(part.label).toContain("run:");
  });
});

describe("codeSnippetLabel", () => {
  it("uses single line when range is one line", () => {
    expect(
      codeSnippetLabel({ filePath: "a/b.tex", startLine: 2, endLine: 2 }),
    ).toBe("b.tex:2");
  });
});

describe("offsetToLineCol", () => {
  it("maps offsets to 1-based line and column", () => {
    const doc = "aa\nbbb\n";
    expect(offsetToLineCol(doc, 0)).toEqual({ line: 1, col: 1 });
    expect(offsetToLineCol(doc, 3)).toEqual({ line: 2, col: 1 });
    expect(offsetToLineCol(doc, 5)).toEqual({ line: 2, col: 3 });
  });
});
