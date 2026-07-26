import { describe, expect, it } from "vitest";
import {
  cleanSessionTitleText,
  deriveSessionTitleForSend,
  extractSessionTitle,
  extractTitleFromContentBlocks,
  isGenericSessionTitle,
  resolveSessionTitle,
} from "../../src/renderer/lib/chat/session-title";
import type { ChatStreamMessage } from "../../src/renderer/stores/chat-store";

describe("session-title", () => {
  it("detects generic OpenCode defaults", () => {
    expect(isGenericSessionTitle("")).toBe(true);
    expect(isGenericSessionTitle("New Chat")).toBe(true);
    expect(isGenericSessionTitle("New session 1")).toBe(true);
    expect(isGenericSessionTitle("Review @main.tex")).toBe(false);
  });

  it("extracts title from inline composer blocks", () => {
    const blocks = [
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
    ];
    expect(extractTitleFromContentBlocks(blocks)).toBe("请看 @main.tex");
  });

  it("extracts slash command label from inline parts", () => {
    const blocks = [
      {
        type: "text" as const,
        text: "/review",
        inlineParts: [
          {
            type: "command" as const,
            id: "c1",
            label: "review",
            commandName: "review",
            source: "builtin",
          },
        ],
      },
    ];
    expect(extractTitleFromContentBlocks(blocks)).toBe("/review");
  });

  it("strips compiled prompt wrappers from raw text", () => {
    const raw = [
      "## Referenced files",
      "",
      "```main.tex",
      "content",
      "```",
      "",
      "please review",
    ].join("\n");
    expect(cleanSessionTitleText(raw)).toBe("please review");
  });

  it("resolves top bar title from messages when tab title is still generic", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "@intro.tex summarize",
              inlineParts: [
                {
                  type: "mention",
                  mentionType: "file",
                  id: "t1",
                  label: "intro.tex",
                  filePath: "intro.tex",
                  fileId: "intro.tex",
                },
                { type: "text", text: " summarize" },
              ],
            },
          ],
        },
      },
    ];
    expect(
      resolveSessionTitle({ title: "New Chat", messages }),
    ).toBe("@intro.tex summarize");
  });

  it("derives title on send when user message was appended first", () => {
    const tab = {
      title: "New Chat",
      messages: [
        {
          type: "user" as const,
          message: {
            content: [
              {
                type: "text" as const,
                text: "/review",
                inlineParts: [
                  {
                    type: "command" as const,
                    id: "c1",
                    label: "review",
                    commandName: "review",
                    source: "builtin",
                  },
                ],
              },
            ],
          },
        },
      ],
    };
    expect(
      deriveSessionTitleForSend(
        tab,
        "## Referenced files\n\nlong compiled prompt",
        tab.messages[0].message?.content,
        null,
      ),
    ).toBe("/review");
  });

  it("extractSessionTitle skips tool-result-only user messages", () => {
    const messages: ChatStreamMessage[] = [
      {
        type: "user",
        message: {
          content: [{ type: "tool_result", tool_use_id: "x", content: "ok" }],
        },
      },
      {
        type: "user",
        message: { content: [{ type: "text", text: "hello" }] },
      },
    ];
    expect(extractSessionTitle(messages)).toBe("hello");
  });
});
