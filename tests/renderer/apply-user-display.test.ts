import { describe, it, expect } from "vitest";
import { applyUserDisplaySnapshots } from "../../src/renderer/components/modules/chat/chat-turns";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("applyUserDisplaySnapshots", () => {
  it("replaces visible user message content with saved display blocks", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "user",
        message: {
          content: [{ type: "text", text: "## Referenced files\n\nlong compiled prompt" }],
        },
      },
      { type: "assistant", message: { content: [{ type: "text", text: "ok" }] } },
      {
        type: "user",
        message: { content: [{ type: "text", text: "another compiled prompt" }] },
      },
    ];

    const snapshots = [
      [
        {
          type: "text" as const,
          text: "请看 @main.tex",
          inlineParts: [
            { type: "text" as const, text: "请看 " },
            {
              type: "mention" as const,
              mentionType: "file" as const,
              id: "t1",
              label: "main.tex",
              filePath: "main.tex",
              fileId: "f1",
            },
          ],
        },
      ],
      [{ type: "text" as const, text: "follow up" }],
    ];

    const restored = applyUserDisplaySnapshots(messages, snapshots);
    expect(restored[0].message?.content?.[0]?.inlineParts).toHaveLength(2);
    expect(restored[0].message?.content?.[0]?.text).toBe("请看 @main.tex");
    expect(restored[1].message?.content?.[0]?.text).toBe("ok");
    expect(restored[2].message?.content?.[0]?.text).toBe("follow up");
  });
});
