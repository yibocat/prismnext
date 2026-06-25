import { describe, expect, it } from "vitest";
import {
  isLazyProjectFilePath,
  isSafeProjectRelativePath,
  resolveProjectRelativePath,
} from "@/lib/files/project-path";

describe("project-path", () => {
  it("resolves safe relative paths under project root", () => {
    expect(
      resolveProjectRelativePath("/proj", ".prismnext/agent/mcp.json"),
    ).toBe("/proj/.prismnext/agent/mcp.json");
  });

  it("rejects path traversal", () => {
    expect(resolveProjectRelativePath("/proj", "../etc/passwd")).toBeNull();
    expect(isSafeProjectRelativePath("foo/../bar")).toBe(false);
  });

  it("identifies lazy prismnext paths", () => {
    expect(isLazyProjectFilePath(".prismnext/agent/mcp.json")).toBe(true);
    expect(isLazyProjectFilePath("chapters/intro.tex")).toBe(false);
  });
});
