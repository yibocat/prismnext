import { describe, expect, it } from "vitest";
import { agentInputHasLaptopAttachments, stripAgentSecrets } from "../../src/shared/remote";

describe("stripAgentSecrets", () => {
  it("removes apiKey and keeps the rest of a send payload", () => {
    const stripped = stripAgentSecrets({
      conversationId: "c1",
      text: "hello",
      apiKey: "sk-live-secret",
      projectRoot: "remote://lab/home/ubuntu/paper",
    });
    expect(stripped).toEqual({
      conversationId: "c1",
      text: "hello",
      projectRoot: "remote://lab/home/ubuntu/paper",
    });
    expect(JSON.stringify(stripped)).not.toContain("sk-live");
  });

  it("drops laptop attachment paths and keeps remote ones", () => {
    const stripped = stripAgentSecrets({
      attachments: [
        { name: "local.png", kind: "file", path: "/Users/me/Desktop/a.png" },
        { name: "note.md", kind: "file", path: "/home/ubuntu/paper/note.md" },
      ],
    });
    expect(stripped.attachments).toEqual([
      { name: "note.md", kind: "file", path: "/home/ubuntu/paper/note.md" },
    ]);
    expect(agentInputHasLaptopAttachments({
      attachments: [{ path: "/Users/me/Desktop/a.png" }],
    })).toBe(true);
  });
});
