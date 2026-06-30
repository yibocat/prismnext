import { describe, expect, it, beforeEach } from "vitest";
import {
  ensureRightAreaVisibleForFiles,
  joinProjectPaths,
  parseGrepResultLine,
  resolveChatFilePath,
} from "@/lib/files/open-project-file";
import { useLayoutStore } from "@/stores/layout-store";

describe("open-project-file", () => {
  const root = "/Users/me/project";

  beforeEach(() => {
    useLayoutStore.setState({
      editorMaximized: false,
      rightAreaExpandNonce: 0,
      focusedMode: "dashboard",
      activeModes: [],
    });
  });

  it("does not exit maximize mode when opening files from chat", () => {
    useLayoutStore.setState({ editorMaximized: true, rightAreaExpandNonce: 3 });
    const nonceBefore = useLayoutStore.getState().rightAreaExpandNonce;

    ensureRightAreaVisibleForFiles();

    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(true);
    expect(st.rightAreaExpandNonce).toBe(nonceBefore);
    expect(st.focusedMode).toBe("files");
  });

  it("requests right area expand when not maximized", () => {
    ensureRightAreaVisibleForFiles();

    const st = useLayoutStore.getState();
    expect(st.editorMaximized).toBe(false);
    expect(st.rightAreaExpandNonce).toBe(1);
    expect(st.focusedMode).toBe("files");
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
});
