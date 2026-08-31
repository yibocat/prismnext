import { describe, expect, it } from "vitest";
import { migrateLegacyRightTab, migrateLegacyRightTabs } from "@/lib/workspace/tab-lifecycle";

describe("migrateLegacyRightTab", () => {
  it("rewrites a TeX Workspace tab with a file into a Files tab", () => {
    const next = migrateLegacyRightTab({
      id: "t1",
      kind: "texworkspace",
      title: "main.tex",
      fileId: "manuscript/main.tex",
      filePath: "manuscript/main.tex",
      isInitial: false,
    });
    expect(next).toMatchObject({
      id: "t1",
      kind: "file",
      fileId: "manuscript/main.tex",
    });
  });

  it("drops a TeX Workspace home tab with no file", () => {
    expect(
      migrateLegacyRightTab({
        id: "t1",
        kind: "texworkspace",
        title: "TeX Workspace",
        isInitial: true,
      }),
    ).toBeNull();
  });

  it("leaves Files tabs unchanged", () => {
    const tab = {
      id: "t1",
      kind: "file",
      title: "notes.md",
      fileId: "notes.md",
      isInitial: false,
    };
    expect(migrateLegacyRightTab(tab)).toEqual(tab);
  });

  it("filters mixed lists", () => {
    const next = migrateLegacyRightTabs([
      { id: "a", kind: "texworkspace", title: "x", isInitial: true },
      { id: "b", kind: "file", title: "a.md", fileId: "a.md", isInitial: false },
      {
        id: "c",
        kind: "texworkspace",
        title: "main.tex",
        fileId: "main.tex",
        isInitial: false,
      },
    ]);
    expect(next.map((t) => t.id)).toEqual(["b", "c"]);
    expect(next[1]?.kind).toBe("file");
  });
});
