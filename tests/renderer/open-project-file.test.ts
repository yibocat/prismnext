import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ensureRightAreaVisibleForFiles,
  joinProjectPaths,
  openProjectFileFromChat,
  parseGrepResultLine,
  resolveChatFilePath,
} from "@/lib/files/open-project-file";
import { useLayoutStore } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";

describe("open-project-file", () => {
  const root = "/Users/me/project";

  beforeEach(() => {
    useLayoutStore.setState({
      editorMaximized: false,
      rightAreaExpandNonce: 0,
    });
  });

  it("does not exit maximize mode when opening files from chat", () => {
    useLayoutStore.setState({ editorMaximized: true, rightAreaExpandNonce: 3 });
    const nonceBefore = useLayoutStore.getState().rightAreaExpandNonce;

    ensureRightAreaVisibleForFiles();

    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(true);
    expect(st.rightAreaExpandNonce).toBe(nonceBefore);
  });

  it("requests right area expand when not maximized", () => {
    ensureRightAreaVisibleForFiles();

    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(false);
    expect(st.rightAreaExpandNonce).toBe(1);
  });

  it("resolves absolute project paths to relative", () => {
    expect(resolveChatFilePath("/Users/me/project/chapters/intro.tex", root)).toBe(
      "chapters/intro.tex",
    );
  });

  it("keeps safe relative paths", () => {
    expect(resolveChatFilePath("src/main.ts", root)).toBe("src/main.ts");
  });

  it("rejects path traversal", () => {
    expect(resolveChatFilePath("../secret", root)).toBeNull();
    expect(resolveChatFilePath("notes/../../etc/passwd.md", root)).toBeNull();
  });

  it("rejects absolute paths outside the project", () => {
    expect(resolveChatFilePath("/tmp/a.md", root)).toBeNull();
    expect(resolveChatFilePath("C:\\Users\\secret.md", root)).toBeNull();
    expect(resolveChatFilePath("C:/Users/secret.md", root)).toBeNull();
  });

  it("does not open absolute paths outside the project from chat", async () => {
    const openExternalFile = vi.fn(async () => {});
    useDocumentStore.setState({
      projectRoot: root,
      openExternalFile,
    } as any);

    await expect(openProjectFileFromChat("/tmp/a.md")).resolves.toBe(false);
    await expect(openProjectFileFromChat("C:/Users/secret.md")).resolves.toBe(false);
    expect(openExternalFile).not.toHaveBeenCalled();
  });

  it("joins directory listings", () => {
    expect(joinProjectPaths("chapters", "intro.tex")).toBe("chapters/intro.tex");
    expect(joinProjectPaths(".", "main.tex")).toBe("main.tex");
  });

  it("parses grep result lines", () => {
    expect(parseGrepResultLine("src/foo.ts:42:const x = 1")).toEqual({
      path: "src/foo.ts",
      line: 42,
    });
    expect(parseGrepResultLine("not a match")).toBeNull();
  });

  it("jumps to a line after opening a compile error location", async () => {
    vi.useFakeTimers();
    const requestJumpToLine = vi.fn();
    const openFile = vi.fn(async () => {});
    useDocumentStore.setState({
      projectRoot: root,
      files: [{
        id: "chapters/intro.tex",
        name: "intro.tex",
        relativePath: "chapters/intro.tex",
        absolutePath: `${root}/chapters/intro.tex`,
        type: "tex",
      }],
      fileMetadata: new Map([
        ["chapters/intro.tex", {
          relativePath: "chapters/intro.tex",
          absolutePath: `${root}/chapters/intro.tex`,
          name: "intro.tex",
          type: "tex",
        }],
      ]),
      openFile,
      requestJumpToLine,
    } as any);

    await expect(
      openProjectFileFromChat("chapters/intro.tex", { line: 12, pin: true }),
    ).resolves.toBe(true);
    vi.advanceTimersByTime(80);
    expect(requestJumpToLine).toHaveBeenCalledWith("chapters/intro.tex", 12);
    vi.useRealTimers();
  });
});
