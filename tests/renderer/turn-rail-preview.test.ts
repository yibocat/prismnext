import { describe, expect, it } from "vitest";
import { extractTurnUserPreview } from "@/lib/chat/chat-turns";
import type { ChatStreamMessage, ContentBlock } from "@/stores/chat-store";

function userMsg(content: ContentBlock[] | string): ChatStreamMessage {
  return {
    type: "user",
    message: {
      content: typeof content === "string" ? [{ type: "text", text: content }] : content,
    },
  };
}

describe("extractTurnUserPreview", () => {
  it("extracts plain text", () => {
    const p = extractTurnUserPreview(userMsg([{ type: "text", text: "hello world" }]));
    expect(p.text).toBe("hello world");
    expect(p.hasAttachments).toBe(false);
  });

  it("extracts from string content", () => {
    const p = extractTurnUserPreview(userMsg("plain string"));
    expect(p.text).toBe("plain string");
  });

  it("flattens inlineParts to plain text", () => {
    const p = extractTurnUserPreview(
      userMsg([
        {
          type: "text",
          text: "",
          inlineParts: [
            { type: "text", text: "see " },
            { type: "link", label: "paper", url: "https://example.com" } as never,
          ],
        },
      ]),
    );
    expect(p.text).toContain("see");
  });

  it("filters system-injected Role/Core Rules blocks", () => {
    const sys =
      "## Role\nYou are integrated into prismnext, a LaTeX academic paper writing workspace.\n## Core Rules";
    const p = extractTurnUserPreview(
      userMsg([
        { type: "text", text: sys },
        { type: "text", text: "real question" },
      ]),
    );
    expect(p.text).toBe("real question");
  });

  it("detects attachments", () => {
    const p = extractTurnUserPreview(
      userMsg([
        {
          type: "text",
          text: "see image",
          attachments: [{ name: "fig.png", kind: "image", path: "/x/fig.png" }],
        },
      ]),
    );
    expect(p.hasAttachments).toBe(true);
    expect(p.text).toBe("see image");
  });

  it("returns empty for null", () => {
    const p = extractTurnUserPreview(null);
    expect(p.text).toBe("");
    expect(p.hasAttachments).toBe(false);
  });

  it("returns empty for tool_result-only message", () => {
    const p = extractTurnUserPreview(
      userMsg([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
    );
    expect(p.text).toBe("");
    expect(p.hasAttachments).toBe(false);
  });
});
