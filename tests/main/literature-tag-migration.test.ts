import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeLibraryDb,
  createPaper,
  getPaper,
  mapPaperForRenderer,
  openLibraryDb,
  updatePaper,
} from "../../src/main/services/literature-service";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function tempProject(): string {
  return tempLiteratureProject();
}

describe("literature tag migration v9", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) {
      closeLibraryDb(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it("migrates cross-paper tag variants to one canonical display", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const a = createPaper(projectRoot, { title: "Paper A" });
    const b = createPaper(projectRoot, { title: "Paper B" });
    updatePaper(projectRoot, a.paper.id, { tags: ["Test"] });
    updatePaper(projectRoot, b.paper.id, { tags: ["test"] });

    closeLibraryDb(projectRoot);
    openLibraryDb(projectRoot);

    expect(mapPaperForRenderer(getPaper(projectRoot, a.paper.id)!).tags).toEqual(["Test"]);
    expect(mapPaperForRenderer(getPaper(projectRoot, b.paper.id)!).tags).toEqual(["Test"]);
  });

  it("merges separator variants on migration", () => {
    const projectRoot = tempProject();
    roots.push(projectRoot);

    const paper = createPaper(projectRoot, { title: "Paper" });
    updatePaper(projectRoot, paper.paper.id, { tags: ["1-test", "1 test"] });

    closeLibraryDb(projectRoot);
    openLibraryDb(projectRoot);

    expect(mapPaperForRenderer(getPaper(projectRoot, paper.paper.id)!).tags).toEqual(["1-test"]);
  });
});
