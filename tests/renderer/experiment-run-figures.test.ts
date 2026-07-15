import { describe, expect, it } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  extractExperimentImageArtifactPaths,
  isExperimentFigureToolUse,
  assistantTextEmbedsImagePath,
  buildNaturalFigureReplyMarkdown,
  resolveMissingFigurePathsForReply,
} from "../../src/renderer/lib/chat/experiment-run-figures";

describe("extractExperimentImageArtifactPaths", () => {
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

  it("resolves island-relative image artifacts against run.cwd", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: { id: "exp-demo", artifacts: ["results/plot.png"] },
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
    expect(extractExperimentImageArtifactPaths(toolUse, toolResult)).toEqual([
      "labs/exp-demo/results/plot.png",
    ]);
  });

  it("returns empty on error or missing result", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: { artifacts: ["a.png"] },
    };
    expect(extractExperimentImageArtifactPaths(toolUse)).toEqual([]);
    expect(
      extractExperimentImageArtifactPaths(toolUse, {
        type: "tool_result",
        tool_use_id: "tu1",
        content: JSON.stringify({ ok: false, error: "fail" }),
        is_error: false,
      }),
    ).toEqual([]);
  });
});

describe("natural figure reply fallback", () => {
  it("detects embedded markdown images", () => {
    const path = "labs/exp-a/results/plot.png";
    expect(assistantTextEmbedsImagePath(`见图：\n\n![p](${path})`, path)).toBe(true);
    expect(assistantTextEmbedsImagePath("见图 results/plot.png", path)).toBe(false);
  });

  it("builds natural reply markdown", () => {
    const md = buildNaturalFigureReplyMarkdown(["labs/exp-a/results/plot.png"]);
    expect(md).toContain("本次运行生成的图如下");
    expect(md).toContain("![plot.png](labs/exp-a/results/plot.png)");
  });

  it("skips fallback when assistant text already embeds the figure", () => {
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
          artifacts: ["results/plot.png"],
          exitCode: 0,
        },
      }),
    };
    const map = new Map<string, ContentBlock>([["tu1", toolResult]]);
    const withEmbed: ContentBlock[] = [
      toolUse,
      {
        type: "text",
        text: "结果如下：\n\n![plot](labs/exp-a/results/plot.png)",
      },
    ];
    expect(resolveMissingFigurePathsForReply(withEmbed, map)).toEqual([]);

    const withoutEmbed: ContentBlock[] = [
      toolUse,
      { type: "text", text: "图已生成。" },
    ];
    expect(resolveMissingFigurePathsForReply(withoutEmbed, map)).toEqual([
      "labs/exp-a/results/plot.png",
    ]);
  });
});
