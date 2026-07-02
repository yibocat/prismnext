import { describe, expect, it } from "vitest";
import {
  assignFlowGroups,
  getFlowGroupMembers,
  mergeFlowGroupMarkdown,
  mergeBlockMarkdown,
  type PaperExtractBlock,
} from "../../src/shared/paper-extract-block";

function textBlock(
  index: number,
  pageIdx: number,
  bbox: [number, number, number, number],
  markdown: string,
): PaperExtractBlock {
  return {
    id: `b${index}`,
    index,
    type: "text",
    pageIdx,
    bbox,
    regions: [{ pageIdx, bbox }],
    markdown,
  };
}

describe("assignFlowGroups", () => {
  it("links cross-column continuation on the same page", () => {
    const blocks = assignFlowGroups([
      textBlock(0, 0, [0.08, 0.62, 0.46, 0.78], "This paragraph starts in the left"),
      textBlock(1, 0, [0.54, 0.12, 0.92, 0.22], "column and continues on the right."),
    ]);
    expect(blocks[0]!.flowGroupId).toBeDefined();
    expect(blocks[1]!.flowGroupId).toBe(blocks[0]!.flowGroupId);
    expect(getFlowGroupMembers(blocks, blocks[1]!)).toHaveLength(2);
  });

  it("links cross-page continuation", () => {
    const blocks = assignFlowGroups([
      textBlock(0, 0, [0.08, 0.72, 0.46, 0.88], "Sentence continues onto the"),
      textBlock(1, 1, [0.08, 0.08, 0.46, 0.18], "next page without ending."),
    ]);
    expect(blocks[0]!.flowGroupId).toBe(blocks[1]!.flowGroupId);
  });

  it("does not link unrelated adjacent text blocks", () => {
    const blocks = assignFlowGroups([
      textBlock(0, 0, [0.08, 0.1, 0.46, 0.2], "First complete paragraph."),
      textBlock(1, 0, [0.08, 0.25, 0.46, 0.35], "Second complete paragraph."),
    ]);
    expect(blocks[0]!.flowGroupId).toBeUndefined();
    expect(blocks[1]!.flowGroupId).toBeUndefined();
  });

  it("does not link text with equation", () => {
    const blocks = assignFlowGroups([
      textBlock(0, 0, [0.08, 0.72, 0.46, 0.88], "Before the formula"),
      {
        id: "b1",
        index: 1,
        type: "equation",
        pageIdx: 1,
        bbox: [0.2, 0.1, 0.8, 0.2],
        regions: [{ pageIdx: 1, bbox: [0.2, 0.1, 0.8, 0.2] }],
        markdown: "$$E=mc^2$$",
      },
    ]);
    expect(blocks[0]!.flowGroupId).toBeUndefined();
  });
});

describe("mergeFlowGroupMarkdown", () => {
  it("prefers full paragraph when first block already contains fragments", () => {
    const members = [
      textBlock(0, 0, [0.1, 0.1, 0.4, 0.2], "Hello world from content list."),
      textBlock(1, 0, [0.5, 0.1, 0.9, 0.2], "world"),
    ];
    expect(mergeFlowGroupMarkdown(members)).toBe("Hello world from content list.");
  });

  it("joins fragments when no single block contains all text", () => {
    const members = [
      textBlock(0, 0, [0.1, 0.6, 0.4, 0.7], "Left part"),
      textBlock(1, 0, [0.5, 0.1, 0.9, 0.2], "right part"),
    ];
    expect(mergeFlowGroupMarkdown(members)).toBe("Left part right part");
  });
});

describe("mergeBlockMarkdown", () => {
  it("dedupes flow groups in multi-select", () => {
    const blocks = assignFlowGroups([
      textBlock(0, 0, [0.08, 0.62, 0.46, 0.78], "Flow A part 1"),
      textBlock(1, 0, [0.54, 0.12, 0.92, 0.22], "Flow A part 2"),
      textBlock(2, 0, [0.08, 0.3, 0.46, 0.4], "Separate paragraph."),
    ]);
    const md = mergeBlockMarkdown([blocks[0]!, blocks[1]!, blocks[2]!], blocks);
    expect(md).toContain("Flow A part 1");
    expect(md).toContain("Separate paragraph.");
    expect(md.split("\n\n")).toHaveLength(2);
  });
});
