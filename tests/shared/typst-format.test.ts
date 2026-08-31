import { describe, expect, it } from "vitest";
import { typstExportFileRel, typstVisibleExportDirRel } from "../../src/shared/compile/typst-format";

describe("typstVisibleExportDirRel", () => {
  it("puts export next to the source, not under .workbench", () => {
    expect(typstVisibleExportDirRel("manuscript/main.typ")).toBe("manuscript/export/main");
    expect(typstVisibleExportDirRel("paper.typ")).toBe("export/paper");
    expect(typstVisibleExportDirRel("./nested/dir/foo.typ")).toBe("nested/dir/export/foo");
  });
});

describe("typstExportFileRel", () => {
  it("joins the visible export dir with the file name", () => {
    expect(typstExportFileRel("manuscript/export/main", "main.pdf")).toBe(
      "manuscript/export/main/main.pdf",
    );
  });
});
