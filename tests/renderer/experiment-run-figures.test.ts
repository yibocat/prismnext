import { describe, expect, it } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  extractExperimentArtifactPaths,
  extractExperimentImageArtifactPaths,
  extractCompileArtifactPaths,
  extractCompileToolErrors,
  collectExperimentArtifactPathsFromBlocks,
  isExperimentFigureToolUse,
  assistantTextEmbedsImagePath,
  buildNaturalFigureReplyMarkdown,
  resolveMissingArtifactPathsForReply,
  resolveMissingFigurePathsForReply,
  resolveSuppressArtifactPathsForToolCards,
} from "../../src/renderer/lib/chat/experiment-run-figures";
import {
  buildArtifactFallbackMarkdown,
  CHAT_ARTIFACT_AUTO_CAP,
} from "../../src/renderer/lib/markdown/chat-artifact";

describe("extractExperimentArtifactPaths", () => {
  it("recognizes experiment-run and append_run", () => {
    expect(
      isExperimentFigureToolUse({
        type: "tool_use",
        name: "experiment-run",
        id: "1",
        input: {},
      }),
    ).toBe(true);
    expect(
      isExperimentFigureToolUse({
        type: "tool_use",
        name: "experiment-log",
        id: "1",
        input: { action: "append_run" },
      }),
    ).toBe(true);
    expect(
      isExperimentFigureToolUse({
        type: "tool_use",
        name: "experiment-log",
        id: "1",
        input: { action: "list" },
      }),
    ).toBe(false);
  });

  it("keeps non-image artifacts and resolves bare image filenames", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: { id: "exp-demo" },
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          runId: "r1",
          cwd: "labs/exp-demo",
          artifacts: ["results/plot.png", "results/metrics.json"],
          exitCode: 0,
        },
      }),
    };
    expect(extractExperimentArtifactPaths(toolUse, toolResult)).toEqual([
      "results/plot.png",
      "results/metrics.json",
    ]);
    expect(extractExperimentImageArtifactPaths(toolUse, toolResult)).toEqual([
      "results/plot.png",
    ]);
  });

  it("keeps manuscript paths as-declared", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          cwd: "experiment/exp-demo",
          artifacts: ["manuscript/benchmark.png"],
          exitCode: 0,
        },
      }),
    };
    expect(extractExperimentArtifactPaths(toolUse, toolResult)).toEqual([
      "manuscript/benchmark.png",
    ]);
  });

  it("prefers image snapshots by basename while keeping other artifacts", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          cwd: "experiment/exp-demo",
          artifacts: ["manuscript/benchmark.png", "out/metrics.json"],
          artifactSnapshots: [
            ".workbench/experiments/exp-demo/artifacts/run-1/benchmark.png",
          ],
          exitCode: 0,
        },
      }),
    };
    expect(extractExperimentArtifactPaths(toolUse, toolResult)).toEqual([
      ".workbench/experiments/exp-demo/artifacts/run-1/benchmark.png",
      "out/metrics.json",
    ]);
  });

  it("joins bare filenames under cwd", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          cwd: "labs/exp-demo",
          artifacts: ["plot.png"],
          exitCode: 0,
        },
      }),
    };
    expect(extractExperimentArtifactPaths(toolUse, toolResult)).toEqual([
      "labs/exp-demo/plot.png",
    ]);
  });

  it("returns empty on error or missing result", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: { artifacts: ["a.png"] },
    };
    expect(extractExperimentArtifactPaths(toolUse)).toEqual([]);
    expect(
      extractExperimentArtifactPaths(toolUse, {
        type: "tool_result",
        tool_use_id: "tu1",
        content: JSON.stringify({ ok: false, error: "fail" }),
        is_error: false,
      }),
    ).toEqual([]);
  });
});

describe("extractCompileArtifactPaths", () => {
  const toolUse: ContentBlock = {
    type: "tool_use",
    id: "tex1",
    name: "latex-compile-standalone",
    input: { mainFile: "figures/lstm-cell.tex" },
  };

  it("reads pdfPath from a successful compile result", () => {
    expect(
      extractCompileArtifactPaths(toolUse, {
        type: "tool_result",
        tool_use_id: "tex1",
        content: {
          success: true,
          mainFile: "figures/lstm-cell.tex",
          pdfPath: "figures/lstm-cell.pdf",
        },
      }),
    ).toEqual(["figures/lstm-cell.pdf"]);
  });

  it("reads pdfPath from a successful typst-compile result", () => {
    expect(
      extractCompileArtifactPaths(
        {
          type: "tool_use",
          id: "typ1",
          name: "typst-compile",
          input: { mainFile: "manuscript/main.typ" },
        },
        {
          type: "tool_result",
          tool_use_id: "typ1",
          content: {
            success: true,
            mainFile: "manuscript/main.typ",
            pdfPath: ".workbench/compile/typst/main.pdf",
          },
        },
      ),
    ).toEqual([".workbench/compile/typst/main.pdf"]);
  });

  it("does not surface a PDF path from a failed compile", () => {
    expect(
      extractCompileArtifactPaths(toolUse, {
        type: "tool_result",
        tool_use_id: "tex1",
        content: {
          success: false,
          pdfPath: "figures/lstm-cell.pdf",
          errorSummary: "Undefined control sequence",
          errors: [{ file: "figures/lstm-cell.tex", line: 4, message: "Undefined control sequence" }],
        },
      }),
    ).toEqual([]);
  });

  it("unwraps ToolHost { result: compile } payloads", () => {
    expect(
      extractCompileArtifactPaths(toolUse, {
        type: "tool_result",
        tool_use_id: "tex1",
        content: JSON.stringify({
          ok: true,
          result: {
            success: true,
            pdfPath: "figures/lstm-cell.pdf",
          },
        }),
      }),
    ).toEqual(["figures/lstm-cell.pdf"]);
  });

  it("prefers host outcome file resources over scraped pdfPath", () => {
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tex1",
      content: { success: true, pdfPath: "figures/ignored.pdf" },
      outcome: { resources: [{ type: "file", path: "figures/lstm-cell.pdf" }] },
    };
    const map = new Map<string, ContentBlock>([["tex1", toolResult]]);
    expect(
      resolveMissingArtifactPathsForReply(
        [toolUse, { type: "text", text: "编译好了。" }],
        map,
      ),
    ).toEqual(["figures/lstm-cell.pdf"]);
  });

  it("does not treat entity outcome resources as file previews", () => {
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tex1",
      content: { success: true, pdfPath: "figures/ignored.pdf" },
      outcome: {
        resources: [
          { type: "file", path: "figures/lstm-cell.pdf" },
          { type: "entity", system: "interaction", id: "lstm-cell", title: "LSTM" },
          { type: "entity", system: "experiment", id: "exp-1" },
        ],
      },
    };
    const map = new Map<string, ContentBlock>([["tex1", toolResult]]);
    expect(
      resolveMissingArtifactPathsForReply(
        [toolUse, { type: "text", text: "编译好了。" }],
        map,
      ),
    ).toEqual(["figures/lstm-cell.pdf"]);
  });

  it("falls back into the reply when the model did not embed the figure", () => {
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tex1",
      content: { success: true, pdfPath: "figures/lstm-cell.pdf" },
    };
    const map = new Map<string, ContentBlock>([["tex1", toolResult]]);
    expect(
      resolveMissingArtifactPathsForReply(
        [toolUse, { type: "text", text: "图已经编译好了，你可以在文件管理器里查看。" }],
        map,
      ),
    ).toEqual(["figures/lstm-cell.pdf"]);
    expect(
      resolveMissingArtifactPathsForReply(
        [toolUse, { type: "text", text: "PNG: `figures/lstm-cell.png`" }],
        map,
      ),
    ).toEqual([]);
  });
});

describe("extractCompileToolErrors", () => {
  it("returns structured errors from a failed compile", () => {
    expect(
      extractCompileToolErrors({
        success: false,
        errors: [
          { file: "manuscript/main.typ", line: 12, message: "expected semicolon" },
        ],
      }),
    ).toEqual([
      { file: "manuscript/main.typ", line: 12, message: "expected semicolon" },
    ]);
  });

  it("unwraps nested result.errors", () => {
    expect(
      extractCompileToolErrors({
        result: {
          success: false,
          errors: [{ file: "main.tex", line: 4, message: "Undefined control sequence" }],
        },
      }),
    ).toEqual([
      { file: "main.tex", line: 4, message: "Undefined control sequence" },
    ]);
  });

  it("returns empty on success even if an errors array is present", () => {
    expect(
      extractCompileToolErrors({
        success: true,
        errors: [{ file: "main.tex", line: 1, message: "should ignore" }],
      }),
    ).toEqual([]);
  });
});

describe("artifact reply fallback", () => {
  it("detects embedded markdown images and fences", () => {
    const path = "labs/exp-a/results/plot.png";
    expect(assistantTextEmbedsImagePath(`见图：\n\n![p](${path})`, path)).toBe(true);
    expect(
      assistantTextEmbedsImagePath(
        "```artifact\npath: labs/exp-a/results/plot.png\ntitle: p\n```",
        path,
      ),
    ).toBe(true);
    expect(assistantTextEmbedsImagePath("见图 results/plot.png", path)).toBe(false);
  });

  it("builds artifact fence fallback markdown", () => {
    const md = buildArtifactFallbackMarkdown(["labs/exp-a/results/metrics.json"]);
    expect(md).toContain("本次运行的结果文件如下");
    expect(md).toContain("```artifact");
    expect(md).toContain("path: labs/exp-a/results/metrics.json");
  });

  it("skips fallback when assistant text already embeds the file", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          cwd: "labs/exp-a",
          artifacts: ["results/plot.png", "results/metrics.json"],
          exitCode: 0,
        },
      }),
    };
    const map = new Map<string, ContentBlock>([["tu1", toolResult]]);
    const withEmbed: ContentBlock[] = [
      toolUse,
      {
        type: "text",
        text: "结果如下：\n\n```artifact\npath: results/plot.png\ntitle: plot\n```\n",
      },
    ];
    expect(resolveMissingArtifactPathsForReply(withEmbed, map)).toEqual([
      "results/metrics.json",
    ]);

    const withoutEmbed: ContentBlock[] = [
      toolUse,
      { type: "text", text: "图已生成。" },
    ];
    expect(resolveMissingFigurePathsForReply(withoutEmbed, map)).toEqual([
      "results/plot.png",
      "results/metrics.json",
    ]);
  });

  it("legacy buildNaturalFigureReplyMarkdown delegates to artifact fences", () => {
    const md = buildNaturalFigureReplyMarkdown(["a.png"]);
    expect(md).toContain("```artifact");
    expect(md).toContain("path: a.png");
  });

  it("suppresses reply embeds and capped fallback from tool cards", () => {
    const artifacts = Array.from(
      { length: CHAT_ARTIFACT_AUTO_CAP + 2 },
      (_, i) => `out/f${i}.csv`,
    );
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: { cwd: "labs/x", artifacts, exitCode: 0 },
      }),
    };
    const map = new Map([["tu1", toolResult]]);
    const blocks: ContentBlock[] = [
      toolUse,
      {
        type: "text",
        text: "```artifact\npath: out/f0.csv\ntitle: t\n```\n",
      },
    ];
    const missing = resolveMissingArtifactPathsForReply(blocks, map);
    expect(missing[0]).toBe("out/f1.csv");
    const suppress = resolveSuppressArtifactPathsForToolCards(blocks, map, missing);
    expect(suppress).toContain("out/f0.csv");
    // Cap of fallback shown is suppressed; overflow remains for the card
    expect(suppress).toContain("out/f1.csv");
    expect(suppress).not.toContain(`out/f${CHAT_ARTIFACT_AUTO_CAP + 1}.csv`);
  });
});

describe("one chat preview per logical figure", () => {
  it("collapses same-run PDF + PNG to the image snapshot", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        run: {
          cwd: "experiments/e1",
          artifacts: [
            "experiments/e1/results/fig.pdf",
            "experiments/e1/results/fig.png",
          ],
          artifactSnapshots: [".workbench/experiments/e1/artifacts/run-1/fig.png"],
          exitCode: 0,
        },
      }),
    };
    expect(extractExperimentArtifactPaths(toolUse, toolResult)).toEqual([
      ".workbench/experiments/e1/artifacts/run-1/fig.png",
    ]);
  });

  it("collapses repeated runs (working path + snapshot) to one preview", () => {
    const mk = (id: string, snapshots?: string[]): [ContentBlock, ContentBlock] => [
      { type: "tool_use", id, name: "experiment-run", input: {} },
      {
        type: "tool_result",
        tool_use_id: id,
        content: JSON.stringify({
          ok: true,
          run: {
            cwd: "experiments/e1",
            artifacts: ["experiments/e1/fig.svg"],
            ...(snapshots ? { artifactSnapshots: snapshots } : {}),
            exitCode: 0,
          },
        }),
      },
    ];
    const [tu1, tr1] = mk("tu1");
    const [tu2, tr2] = mk("tu2", [".workbench/experiments/e1/artifacts/run-2/fig.svg"]);
    const map = new Map<string, ContentBlock>([
      ["tu1", tr1],
      ["tu2", tr2],
    ]);
    expect(collectExperimentArtifactPathsFromBlocks([tu1, tu2], map)).toEqual([
      ".workbench/experiments/e1/artifacts/run-2/fig.svg",
    ]);
  });
});
