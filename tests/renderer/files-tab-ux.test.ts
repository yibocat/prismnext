import { describe, expect, it } from "vitest";
import { collapseBreadcrumbSegments } from "../../src/renderer/lib/files/breadcrumb-segments";
import { tabDisplayTitle } from "../../src/renderer/lib/workspace/tab-lifecycle";
import { getMentionableFiles } from "../../src/renderer/lib/files/mentionable-files";
import type { RightTab } from "../../src/renderer/lib/workspace/mode-registry";

describe("breadcrumb-segments", () => {
  it("collapses long paths", () => {
    const items = collapseBreadcrumbSegments(["a", "b", "c", "d", "e"]);
    expect(items.map((i) => i.label)).toEqual(["a", "…", "d", "e"]);
  });

  it("keeps short paths intact", () => {
    const items = collapseBreadcrumbSegments(["manuscript", "main.tex"]);
    expect(items.map((i) => i.label)).toEqual(["manuscript", "main.tex"]);
  });
});

describe("tab-lifecycle", () => {
  it("prefixes dirty file tab titles with asterisk", () => {
    const tab: RightTab = {
      id: "t1",
      kind: "file",
      title: "main.tex",
      isInitial: false,
      fileId: "main.tex",
    };
    const dirty = new Set(["main.tex"]);
    expect(tabDisplayTitle(tab, dirty)).toBe("*main.tex");
    expect(tabDisplayTitle(tab, new Set())).toBe("main.tex");
  });
});

describe("mentionable-files", () => {
  it("includes external metadata entries", () => {
    const meta = new Map([
      [
        "__external__:/tmp/x.md",
        {
          relativePath: "/tmp/x.md",
          absolutePath: "/tmp/x.md",
          name: "x.md",
          type: "other" as const,
          isExternal: true,
        },
      ],
    ]);
    const result = getMentionableFiles([], meta);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("__external__:/tmp/x.md");
  });
});
