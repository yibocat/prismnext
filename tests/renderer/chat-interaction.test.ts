import { describe, expect, it } from "vitest";
import {
  buildInteractionFenceMarkdown,
  parseInteractionFenceContent,
} from "../../src/renderer/lib/markdown/chat-interaction";

describe("parseInteractionFenceContent", () => {
  it("reads id and title lines", () => {
    expect(
      parseInteractionFenceContent("id: plot.loss\ntitle: Loss curve\n"),
    ).toEqual({ id: "plot.loss", title: "Loss curve" });
  });

  it("uses first bare line as id", () => {
    expect(parseInteractionFenceContent("plot.loss\n")).toEqual({
      id: "plot.loss",
      title: undefined,
    });
  });

  it("rejects empty or parent traversal", () => {
    expect(parseInteractionFenceContent("")).toBeNull();
    expect(parseInteractionFenceContent("id: ../secret")).toBeNull();
  });
});

describe("buildInteractionFenceMarkdown", () => {
  it("emits fence with optional title", () => {
    expect(buildInteractionFenceMarkdown("plot.loss", "Loss")).toBe(
      ["```interaction", "id: plot.loss", "title: Loss", "```"].join("\n"),
    );
    expect(buildInteractionFenceMarkdown("plot.loss")).toBe(
      ["```interaction", "id: plot.loss", "```"].join("\n"),
    );
  });
});
