import { describe, expect, it } from "vitest";
import { resolveSnippetFilePath, toCheckoutRelativePath } from "@/lib/files/snippet-file-path";

const ctx = {
  projectRoot: "/Users/me/project",
  checkoutRoot: "/Users/me/project",
  files: [
    {
      id: "note/note.md",
      relativePath: "note/note.md",
      absolutePath: "/Users/me/project/note/note.md",
    },
    {
      id: "manuscript/main.tex",
      relativePath: "manuscript/main.tex",
      absolutePath: "/Users/me/project/manuscript/main.tex",
    },
    {
      id: "README.md",
      relativePath: "README.md",
      absolutePath: "/Users/me/project/README.md",
    },
  ],
  fileMetadata: new Map([
    [
      "note/note.md",
      {
        relativePath: "note/note.md",
        absolutePath: "/Users/me/project/note/note.md",
      },
    ],
  ]),
};

describe("resolveSnippetFilePath", () => {
  it("prefers document-store relativePath via fileId over wrong tab path", () => {
    expect(
      resolveSnippetFilePath(ctx, "note/note.md", "/Users/me/project/note/note.md"),
    ).toBe("note/note.md");
  });

  it("uses fileId path segment when fallback is basename-only", () => {
    expect(resolveSnippetFilePath(ctx, "note/note.md", "note.md")).toBe("note/note.md");
  });

  it("resolves root-level files by id from files list", () => {
    expect(resolveSnippetFilePath(ctx, "README.md", "wrong.md")).toBe("README.md");
  });

  it("converts absolute fallback to relative when fileId is missing", () => {
    expect(
      resolveSnippetFilePath(ctx, undefined, "/Users/me/project/note/note.md"),
    ).toBe("note/note.md");
  });

  it("keeps external absolute paths", () => {
    const externalId = "__external__:/tmp/outside.md";
    expect(resolveSnippetFilePath(ctx, externalId, "/tmp/outside.md")).toBe("/tmp/outside.md");
  });

  it("falls back when fileId is opaque and not in store", () => {
    expect(resolveSnippetFilePath(ctx, "f1", "src/main.ts")).toBe("src/main.ts");
  });
});

describe("toCheckoutRelativePath", () => {
  it("strips project root prefix", () => {
    expect(
      toCheckoutRelativePath("/Users/me/project/note/note.md", ctx),
    ).toBe("note/note.md");
  });
});
