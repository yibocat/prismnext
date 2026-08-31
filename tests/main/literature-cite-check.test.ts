import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { citeCheckLiterature, openLibraryDb } from "../../src/main/literature/facade";
import { tempLiteratureProject } from "./helpers/temp-literature-project";

function mkTempProject(): string {
  return tempLiteratureProject();
}

describe("citeCheckLiterature", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reports missing citekeys from project .tex files", () => {
    projectRoot = mkTempProject();
    openLibraryDb(projectRoot);
    const db = openLibraryDb(projectRoot);
    const now = Date.now();
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'manual', NULL, ?, ?)`,
    ).run("paper-1", "knownKey", "Known Paper", now, now);

    fs.writeFileSync(
      path.join(projectRoot, "main.tex"),
      "\\documentclass{article}\n\\cite{knownKey, missingKey}\n",
      "utf-8",
    );

    const result = citeCheckLiterature(projectRoot);
    expect(result.texFilesScanned).toBe(1);
    expect(result.typFilesScanned).toBe(0);
    expect(result.citeKeysInTex).toEqual(expect.arrayContaining(["knownKey", "missingKey"]));
    expect(result.missingKeys).toEqual(["missingKey"]);
    expect(result.unusedKeys).toEqual([]);
  });

  it("reports missing citekeys from project .typ files", () => {
    projectRoot = mkTempProject();
    openLibraryDb(projectRoot);
    const db = openLibraryDb(projectRoot);
    const now = Date.now();
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'manual', NULL, ?, ?)`,
    ).run("paper-1", "knownKey", "Known Paper", now, now);

    fs.writeFileSync(
      path.join(projectRoot, "main.typ"),
      "#bibliography(\"refs.bib\")\nSee @knownKey and @missingKey\n",
      "utf-8",
    );

    const result = citeCheckLiterature(projectRoot);
    expect(result.typFilesScanned).toBe(1);
    expect(result.citeKeysInTex).toEqual(expect.arrayContaining(["knownKey", "missingKey"]));
    expect(result.missingKeys).toEqual(["missingKey"]);
  });
});
