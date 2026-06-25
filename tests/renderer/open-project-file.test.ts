import { describe, expect, it } from "vitest";
import {
  joinProjectPaths,
  parseGrepResultLine,
  resolveChatFilePath,
} from "@/lib/files/open-project-file";

describe("open-project-file", () => {
  const root = "/Users/me/project";

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
