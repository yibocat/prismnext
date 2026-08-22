import { describe, it, expect } from "vitest";
import { applyUserDisplaySnapshots } from "../../src/renderer/lib/chat/chat-turns";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

function user(text: string): ChatStreamMessage {
  return { type: "user", message: { content: [{ type: "text", text }] } };
}

function assistant(text: string): ChatStreamMessage {
  return { type: "assistant", message: { content: [{ type: "text", text }] } };
}

describe("applyUserDisplaySnapshots", () => {
  it("replaces visible user message content with saved display blocks", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "user",
        message: {
          content: [{ type: "text", text: "## Referenced files\n\nlong compiled prompt" }],
        },
      },
      assistant("ok"),
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

  it("aligns from the end when an extra OpenCode user would shift snapshots", () => {
    // Silent/extra user between turns previously stole the 「继续」snapshot and
    // painted it onto the first bubble.
    const messages: ChatStreamMessage[] = [
      user("四任务：查看项目目录并改进笔记"),
      assistant("working…"),
      user("Approve plan"), // not plan-control text in this fixture — extra row
      assistant("ok"),
      user("继续 compiled"),
    ];
    const snapshots = [
      [{ type: "text" as const, text: "四任务：查看项目目录并改进笔记" }],
      [{ type: "text" as const, text: "继续" }],
    ];

    const restored = applyUserDisplaySnapshots(messages, snapshots);
    // End-align: last snap → last user; first snap → second-to-last visible user
    // (the middle "Approve plan" keeps OpenCode text — not overwritten with 继续).
    expect(restored[0].message?.content?.[0]?.text).toBe("四任务：查看项目目录并改进笔记");
    expect(restored[2].message?.content?.[0]?.text).toBe("四任务：查看项目目录并改进笔记");
    expect(restored[4].message?.content?.[0]?.text).toBe("继续");
  });

  it("does not let a lone later snapshot overwrite the first user bubble", () => {
    const messages: ChatStreamMessage[] = [
      user("original task from OpenCode"),
      assistant("…"),
      user("继续 from OpenCode"),
    ];
    const snapshots = [[{ type: "text" as const, text: "继续" }]];

    const restored = applyUserDisplaySnapshots(messages, snapshots);
    expect(restored[0].message?.content?.[0]?.text).toBe("original task from OpenCode");
    expect(restored[2].message?.content?.[0]?.text).toBe("继续");
  });
});
