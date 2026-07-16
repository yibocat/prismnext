import { describe, expect, it } from "vitest";
import {
  mimeTypeFromPath,
  pathToFileUri,
  promptFileFromAttachment,
  type ComposerAttachment,
} from "../../src/renderer/lib/chat/composer-attach-file";
import { shouldSendPromptToAgent } from "../../src/renderer/components/modules/chat/inline-composer/compile-composer-prompt";

describe("composer file attachments as ACP resource_link", () => {
  it("builds resource_link metadata without reading file bodies", () => {
    const att: ComposerAttachment = {
      id: "a1",
      fileId: "f1",
      absolutePath: "/Users/me/paper/notes.md",
      displayPath: "notes.md",
      name: "notes.md",
      kind: "file",
    };
    const file = promptFileFromAttachment(att);
    expect(file.kind).toBe("resource_link");
    expect(file.uri).toBe(pathToFileUri("/Users/me/paper/notes.md"));
    expect(file.name).toBe("notes.md");
    expect(file.mimeType).toBe("text/markdown");
  });

  it("maps common document mime types", () => {
    expect(mimeTypeFromPath("a.pdf")).toBe("application/pdf");
    expect(mimeTypeFromPath("a.tex")).toBe("text/x-tex");
    expect(mimeTypeFromPath("a.docx")).toContain("wordprocessingml");
  });

  it("sends when only ACP file attachments are present", () => {
    expect(
      shouldSendPromptToAgent(
        {
          promptText: "请分析附件",
          aiCommandNames: [],
          actionCommands: [],
          promptImages: [],
          promptFiles: [
            {
              kind: "resource_link",
              uri: "file:///tmp/a.md",
              name: "a.md",
              mimeType: "text/markdown",
            },
          ],
        },
        [{ type: "text", text: "请分析附件" }],
        1,
      ),
    ).toBe(true);
  });
});
