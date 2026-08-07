import { describe, expect, it } from "vitest";
import type { ContentBlock } from "../../src/renderer/stores/chat-store";
import {
  buildInteractionFallbackMarkdown,
  collectEmbeddedInteractionIds,
  missingInteractionFencesInText,
} from "../../src/renderer/lib/markdown/chat-interaction";
import {
  buildInteractionReplyFallbackMarkdown,
  collectInteractionResourcePathsFromBlocks,
  extractInteractionWriteSuccess,
  resolveMissingInteractionFencesForReply,
} from "../../src/renderer/lib/chat/interaction-fence-fallback";

describe("collectEmbeddedInteractionIds", () => {
  it("collects ids from interaction fences", () => {
    const text = "see\n\n```interaction\nid: plot.loss\ntitle: Loss\n```\n";
    expect(collectEmbeddedInteractionIds(text)).toEqual(["plot.loss"]);
  });
});

describe("missingInteractionFencesInText", () => {
  it("filters items already embedded", () => {
    const items = [
      { id: "plot.loss", title: "Loss" },
      { id: "fig.main", title: "Main" },
    ];
    const text = "```interaction\nid: plot.loss\n```";
    expect(missingInteractionFencesInText(text, items)).toEqual([
      { id: "fig.main", title: "Main" },
    ]);
  });
});

describe("extractInteractionWriteSuccess", () => {
  it("reads id/title from successful tool result", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "interaction-write",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        spec: { id: "plot.loss", title: "Loss curve", kind: "plot.line" },
        fenceMarkdown: "```interaction\nid: plot.loss\n```",
      }),
    };
    expect(extractInteractionWriteSuccess(toolUse, toolResult)).toEqual({
      id: "plot.loss",
      title: "Loss curve",
    });
  });

  it("returns null on error or non-write tool", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "experiment-run",
      input: {},
    };
    expect(extractInteractionWriteSuccess(toolUse, undefined)).toBeNull();
  });
});

describe("resolveMissingInteractionFencesForReply", () => {
  it("appends fallback when write succeeded but prose lacks fence", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "interaction-write",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        spec: { id: "plot.loss", title: "Loss", kind: "plot.series" },
      }),
    };
    const map = new Map<string, ContentBlock>([["tu1", toolResult]]);
    const blocks: ContentBlock[] = [
      toolUse,
      { type: "text", text: "曲线已写入 Interaction 面板。" },
    ];
    expect(resolveMissingInteractionFencesForReply(blocks, map)).toEqual([
      { id: "plot.loss", title: "Loss" },
    ]);
    const md = buildInteractionReplyFallbackMarkdown(blocks, map);
    expect(md).toContain("```interaction");
    expect(md).toContain("id: plot.loss");
  });

  it("skips when fence already in prose", () => {
    const toolUse: ContentBlock = {
      type: "tool_use",
      id: "tu1",
      name: "interaction-write",
      input: {},
    };
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        spec: { id: "plot.loss", title: "Loss", kind: "plot.series" },
      }),
    };
    const map = new Map<string, ContentBlock>([["tu1", toolResult]]);
    const fence = "```interaction\nid: plot.loss\ntitle: Loss\n```";
    const blocks: ContentBlock[] = [
      toolUse,
      { type: "text", text: fence },
    ];
    expect(resolveMissingInteractionFencesForReply(blocks, map)).toEqual([]);
    expect(buildInteractionReplyFallbackMarkdown(blocks, map)).toBe("");
  });

  it("detects fences with whitespace after language tag", () => {
    const corpus = "``` interaction\nid: fig.a\n```";
    expect(collectEmbeddedInteractionIds(corpus)).toEqual(["fig.a"]);
  });
});

describe("buildInteractionFallbackMarkdown", () => {
  it("joins multiple fences", () => {
    const md = buildInteractionFallbackMarkdown([
      { id: "a", title: "A" },
      { id: "b" },
    ]);
    expect(md).toContain("id: a");
    expect(md).toContain("id: b");
  });
});

describe("collectInteractionResourcePathsFromBlocks", () => {
  const writeUse = (id: string): ContentBlock => ({
    type: "tool_use",
    id,
    name: "interaction-write",
    input: {},
  });

  it("collects normalized spec resource paths from successful writes", () => {
    const toolUse = writeUse("tu1");
    const toolResult: ContentBlock = {
      type: "tool_result",
      tool_use_id: "tu1",
      content: JSON.stringify({
        ok: true,
        spec: {
          id: "fig.main",
          kind: "figure.static",
          resources: [
            { path: "artifacts/run-1\\fig.png" },
            { artifactPath: "output/fig.pdf" },
            { path: "" },
            { label: "no path" },
          ],
        },
      }),
    };
    const map = new Map<string, ContentBlock>([["tu1", toolResult]]);
    expect(collectInteractionResourcePathsFromBlocks([toolUse], map)).toEqual([
      "artifacts/run-1/fig.png",
      "output/fig.pdf",
    ]);
  });

  it("dedupes repeated paths and skips error / non-write blocks", () => {
    const useA = writeUse("tu-a");
    const useB = writeUse("tu-b");
    const useOther: ContentBlock = {
      type: "tool_use",
      id: "tu-c",
      name: "experiment-run",
      input: {},
    };
    const map = new Map<string, ContentBlock>([
      [
        "tu-a",
        {
          type: "tool_result",
          tool_use_id: "tu-a",
          content: JSON.stringify({
            ok: true,
            spec: { id: "f1", resources: [{ path: "out/a.png" }] },
          }),
        },
      ],
      [
        "tu-b",
        {
          type: "tool_result",
          tool_use_id: "tu-b",
          is_error: true,
          content: JSON.stringify({
            ok: false,
            spec: { id: "f2", resources: [{ path: "out/b.png" }] },
          }),
        },
      ],
      [
        "tu-c",
        {
          type: "tool_result",
          tool_use_id: "tu-c",
          content: JSON.stringify({
            ok: true,
            spec: { id: "f3", resources: [{ path: "out/c.png" }] },
          }),
        },
      ],
    ]);
    expect(
      collectInteractionResourcePathsFromBlocks([useA, useB, useOther], map),
    ).toEqual(["out/a.png"]);
  });
});
