import { describe, expect, it } from "vitest";
import {
  chipPositionInViewport,
  resolveSelectionChipPosition,
  selectionActionX,
} from "../../src/renderer/lib/selection-chip-position";
import { codeSnippetDragPayload } from "../../src/renderer/lib/chat/code-snippet-drag";
import { gitDiffDragPayload } from "../../src/renderer/lib/chat/git-diff-drag";
import {
  dragPayloadToContextRequest,
  parseComposerDragPayloads,
  serializeComposerDragPayloads,
} from "../../src/renderer/lib/chat/composer-drag";

describe("resolveSelectionChipPosition", () => {
  const anchor = {
    top: 100,
    bottom: 120,
    leftX: 40,
    rightX: 180,
  };

  it("prefers after-top (right of cursor) when it fits", () => {
    const pos = resolveSelectionChipPosition(anchor, {
      left: 0,
      top: 0,
      right: 400,
      bottom: 300,
    });
    expect(pos.placement).toBe("after-top");
    expect(pos.left).toBeGreaterThan(anchor.rightX);
  });

  it("falls back to left of cursor when no room on the right", () => {
    const pos = resolveSelectionChipPosition(
      { ...anchor, rightX: 180 },
      { left: 0, top: 0, right: 200, bottom: 300 },
    );
    expect(pos.placement).not.toBe("after-top");
    expect(pos.top).toBeGreaterThanOrEqual(6);
  });

  it("uses selectionActionX so a top-right chip aligns to the trailing edge", () => {
    const tight = {
      top: 80,
      bottom: 100,
      leftX: 40,
      rightX: window.innerWidth - 20,
    };
    const pos = chipPositionInViewport(tight);
    const resolved = resolveSelectionChipPosition(tight, {
      left: 8,
      top: 8,
      right: window.innerWidth - 8,
      bottom: window.innerHeight - 8,
    });
    expect(pos.left).toBe(selectionActionX(resolved, tight));
    expect(pos.placement).toBe(resolved.placement);
  });
});

describe("code-snippet drag", () => {
  it("round-trips through composer mime", () => {
    const raw = serializeComposerDragPayloads([
      codeSnippetDragPayload({
        filePath: "main.tex",
        text: "\\section{A}",
        startLine: 2,
        endLine: 2,
        source: "editor",
      }),
    ]);
    const parsed = parseComposerDragPayloads(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.kind).toBe("code-snippet");
    const req = dragPayloadToContextRequest(parsed[0]!);
    expect(req.kind).toBe("code");
    if (req.kind === "code") {
      expect(req.startLine).toBe(2);
      expect(req.text).toContain("\\section");
    }
  });
});

describe("git-diff drag", () => {
  it("round-trips through composer mime", () => {
    const raw = serializeComposerDragPayloads([
      gitDiffDragPayload({
        filePath: "main.tex",
        layout: "unified",
        hunks: [
          {
            oldStartLine: 1,
            oldLineCount: 1,
            newStartLine: 1,
            newLineCount: 1,
            lines: ["-old", "+new"],
          },
        ],
        removedLineCount: 1,
        addedLineCount: 1,
      }),
    ]);
    const parsed = parseComposerDragPayloads(raw);
    expect(parsed[0]?.kind).toBe("git-diff");
    const req = dragPayloadToContextRequest(parsed[0]!);
    expect(req.kind).toBe("git-diff");
  });
});
