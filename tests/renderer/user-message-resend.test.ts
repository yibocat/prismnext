import { describe, expect, it } from "vitest";
import { extractUserMessageEditParts } from "@/lib/chat/user-message-resend";
import type { ChatStreamMessage } from "@/stores/chat-store";

describe("extractUserMessageEditParts", () => {
  it("prefers inlineParts over plain text", () => {
    const msg: ChatStreamMessage = {
      type: "user",
      message: {
        content: [
          {
            type: "text",
            text: "ignored plain",
            inlineParts: [
              { type: "text", text: "Hello " },
              {
                type: "mention",
                mentionType: "file",
                id: "1",
                label: "main.tex",
                filePath: "main.tex",
                fileId: "f1",
              },
            ],
          },
        ],
      },
    };
    const { parts } = extractUserMessageEditParts(msg);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: "text", text: "Hello " });
    expect(parts[1]).toMatchObject({ type: "mention", label: "main.tex" });
  });

  it("falls back to visible text blocks", () => {
    const msg: ChatStreamMessage = {
      type: "user",
      message: {
        content: [{ type: "text", text: "Rewrite the abstract" }],
      },
    };
    const { parts } = extractUserMessageEditParts(msg);
    expect(parts).toEqual([{ type: "text", text: "Rewrite the abstract" }]);
  });
});
