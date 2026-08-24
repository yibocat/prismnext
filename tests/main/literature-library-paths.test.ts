import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPaper,
  getLibraryPaths,
  listPapers,
  resolveLibraryDisplayAbs,
  resolveLibraryProjectRoot,
} from "../../src/main/literature/facade";
import { resolveWorkbenchHome } from "../../src/main/workbench/home";
import { writeProjectSlotMeta } from "../../src/main/workbench/default-project";
import { readWorkbenchJson } from "../../src/main/workbench/identity";
import { libraryRel, worktreeCheckoutRel } from "../../src/shared/workbench/paths";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

describe("getLibraryPaths (D-28)", () => {
  it("writes the library under the workbench home slot, not the paper folder", () => {
    const root = tempLiteratureProject("p_slot_a");
    const paths = getLibraryPaths(root);

    expect(paths.libraryDir).toBe(join(resolveWorkbenchHome(), libraryRel("p_slot_a")));
    expect(paths.dbPath.endsWith("library.db")).toBe(true);
    expect(paths.libraryDir.includes(join(root, ".prismnext"))).toBe(false);
    expect(paths.libraryDir.includes(join(root, ".workbench", "library"))).toBe(false);

    createPaper(root, { title: "Only in A" });
    expect(existsSync(paths.dbPath)).toBe(true);
    expect(existsSync(join(root, ".prismnext"))).toBe(false);
    expect(listPapers(root).map((p) => p.title)).toEqual(["Only in A"]);
  });

  it("keeps two paper folders on separate libraries", () => {
    const a = tempLiteratureProject("p_slot_a");
    const b = tempLiteratureProject("p_slot_b");
    createPaper(a, { title: "Paper A" });
    expect(listPapers(b)).toEqual([]);
    expect(listPapers(a)).toHaveLength(1);
  });

  it("does not resolve old .prismnext/library display paths", () => {
    const root = tempLiteratureProject("p_slot_a");
    expect(resolveLibraryDisplayAbs(root, ".prismnext/library/attachments/x.pdf")).toBeNull();
    expect(resolveLibraryDisplayAbs(root, "library/attachments/x.pdf")).toBe(
      join(getLibraryPaths(root).attachmentsDir, "x.pdf"),
    );
  });

  it("walks up to the folder that has workbench.json", () => {
    const root = tempLiteratureProject("p_walk");
    const nested = join(root, "manuscript", "src");
    expect(resolveLibraryProjectRoot(nested)).toBe(root);
    expect(readWorkbenchJson(root)?.id).toBe("p_walk");
  });

  it("maps a home worktree checkout back to the paper lastPath", () => {
    const root = tempLiteratureProject("p_wt");
    writeProjectSlotMeta("p_wt", { lastPath: root });
    const checkout = join(resolveWorkbenchHome(), worktreeCheckoutRel("p_wt", "calm-owl"), "src");
    expect(resolveLibraryProjectRoot(checkout)).toBe(root);
    expect(resolveLibraryProjectRoot(join(root, ".prismnext", "worktrees", "old"))).toBe(root);
  });
});
