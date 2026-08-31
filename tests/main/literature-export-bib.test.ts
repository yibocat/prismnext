import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  citeCheckLiterature,
  mergeLibraryIntoProjectBib,
  openLibraryDb,
} from "../../src/main/literature/facade";
import { checkBibConsistency } from "../../src/main/compile/latex-service";

import { tempLiteratureProject } from "./helpers/temp-literature-project";

function mkTempProject(): string {
  return tempLiteratureProject();
}

describe("mergeLibraryIntoProjectBib", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("appends cited library keys missing from project .bib", () => {
    projectRoot = mkTempProject();
    fs.mkdirSync(path.join(projectRoot, "manuscript"), { recursive: true });
    openLibraryDb(projectRoot);
    const db = openLibraryDb(projectRoot);
    const now = Date.now();
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'manual', ?, ?, ?)`,
    ).run(
      "p1",
      "inLibrary",
      "In Library",
      "@article{inLibrary, title={In Library}, author={A}, year={2024}}",
      now,
      now,
    );

    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "main.tex"),
      "\\documentclass{article}\n\\cite{inLibrary}\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "references.bib"),
      "@article{other, title={Other}, author={B}, year={2023}}\n",
      "utf-8",
    );

    const result = mergeLibraryIntoProjectBib(projectRoot, { onlyCitedInTex: true });
    expect(result.appended).toEqual(["inLibrary"]);
    expect(result.skipped).toEqual([]);

    const bib = fs.readFileSync(result.bibPath, "utf-8");
    expect(bib).toContain("@article{inLibrary");
    expect(bib).toContain("@article{other");
  });

  it("appends keys cited in a Typst manuscript", () => {
    projectRoot = mkTempProject();
    openLibraryDb(projectRoot);
    const db = openLibraryDb(projectRoot);
    const now = Date.now();
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 2024, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'manual', ?, ?, ?)`,
    ).run(
      "p1",
      "inLibrary",
      "In Library",
      "@article{inLibrary, title={In Library}, author={A}, year={2024}}",
      now,
      now,
    );

    fs.writeFileSync(
      path.join(projectRoot, "main.typ"),
      "#bibliography(\"references.bib\")\n@inLibrary\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "references.bib"),
      "@article{other, title={Other}, author={B}, year={2023}}\n",
      "utf-8",
    );

    const result = mergeLibraryIntoProjectBib(projectRoot, { onlyCitedInTex: true });
    expect(result.appended).toEqual(["inLibrary"]);
    const bib = fs.readFileSync(result.bibPath, "utf-8");
    expect(bib).toContain("@article{inLibrary");
  });
});

describe("checkBibConsistency libraryCheck", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("includes libraryCheck by default", () => {
    projectRoot = mkTempProject();
    fs.mkdirSync(path.join(projectRoot, "manuscript"), { recursive: true });
    openLibraryDb(projectRoot);
    const db = openLibraryDb(projectRoot);
    const now = Date.now();
    db.prepare(
      `INSERT INTO papers (id, bibkey, title, authors, year, abstract, doi, arxiv_id, isbn, venue, type, pdf_path, pdf_sha, origin, raw_bibtex, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'manual', NULL, ?, ?)`,
    ).run("p1", "knownKey", "Known", now, now);

    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\addbibresource{references.bib}
\begin{document}
\cite{knownKey, ghostKey}
\end{document}`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "references.bib"),
      "@article{knownKey, title={K}, author={A}, year={2024}}\n",
      "utf-8",
    );

    const result = checkBibConsistency(projectRoot);
    expect(result.missingKeys).toEqual(["ghostKey"]);
    expect(result.libraryCheck?.missingKeys).toEqual(["ghostKey"]);
    expect(citeCheckLiterature(projectRoot).missingKeys).toEqual(["ghostKey"]);
  });
});
