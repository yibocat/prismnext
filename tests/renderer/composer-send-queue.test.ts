import { describe, expect, it } from "vitest";
import {
  appendComposerParts,
  combineComposerQueueItems,
  composerQueueItemPreview,
  type ComposerQueueItem,
} from "@/lib/chat/composer-send-queue";

function item(partial: Partial<ComposerQueueItem> & Pick<ComposerQueueItem, "parts">): ComposerQueueItem {
  return {
    id: partial.id ?? "x",
    parts: partial.parts,
    pinnedContexts: partial.pinnedContexts ?? [],
    attachments: partial.attachments ?? [],
    createdAt: partial.createdAt ?? 1,
  };
}

describe("composer-send-queue", () => {
  it("previews text and mentions", () => {
    const preview = composerQueueItemPreview(
      item({
        parts: [
          { type: "text", text: "Hello " },
          { type: "mention", mentionType: "file", id: "1", label: "main.tex", filePath: "main.tex", fileId: "f1" },
        ],
      }),
    );
    expect(preview).toContain("Hello");
    expect(preview).toContain("main.tex");
  });

  it("combines multiple items with separators and dedupes attachments", () => {
    const combined = combineComposerQueueItems([
      item({
        parts: [{ type: "text", text: "first" }],
        attachments: [
          {
            id: "a1",
            name: "a.png",
            absolutePath: "/a.png",
            relativePath: "a.png",
            kind: "image",
          },
        ],
      }),
      item({
        parts: [{ type: "text", text: "second" }],
        attachments: [
          {
            id: "a2",
            name: "a.png",
            absolutePath: "/a.png",
            relativePath: "a.png",
            kind: "image",
          },
        ],
      }),
    ]);
    expect(combined.parts).toEqual([
      { type: "text", text: "first" },
      { type: "text", text: "\n\n" },
      { type: "text", text: "second" },
    ]);
    expect(combined.attachments).toHaveLength(1);
  });

  it("appends parts after existing draft", () => {
    expect(
      appendComposerParts(
        [{ type: "text", text: "hi" }],
        [{ type: "text", text: "there" }],
      ),
    ).toEqual([
      { type: "text", text: "hi" },
      { type: "text", text: "\n" },
      { type: "text", text: "there" },
    ]);
  });
});
