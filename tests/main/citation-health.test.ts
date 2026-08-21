import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCitationHealth,
  importProjectBibKeysIntoLibrary,
} from "../../src/main/services/citation-health";

import { tempLiteratureProject } from "./helpers/temp-literature-project";

function mkTempProject(): string {
  return tempLiteratureProject();
}

describe("getCitationHealth", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("reports bibFallback from manuscript .bib for keys missing in library", () => {
    projectRoot = mkTempProject();
    fs.mkdirSync(path.join(projectRoot, "manuscript"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "main.tex"),
      String.raw`\documentclass{article}
\addbibresource{references.bib}
\begin{document}
\cite{inBibOnly}
\end{document}`,
      "utf-8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "references.bib"),
      "@article{inBibOnly, title={From Bib File}, author={A}, year={2024}, doi={10.1000/test}}\n",
      "utf-8",
    );

    const health = getCitationHealth(projectRoot);
    expect(health.libraryCheck.missingKeys).toEqual(["inBibOnly"]);
    expect(health.bibCheck.missingKeys).toEqual([]);
    expect(health.bibFallback).toEqual([
      expect.objectContaining({
        bibkey: "inBibOnly",
        title: "From Bib File",
        doi: "10.1000/test",
        canImportFromBib: true,
      }),
    ]);
    expect(health.bibKeysNotInLibrary).toEqual(["inBibOnly"]);
  });
});

describe("importProjectBibKeysIntoLibrary", () => {
  let projectRoot: string;

  afterEach(() => {
    if (projectRoot) fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("imports missing keys from project .bib into library.db", async () => {
    projectRoot = mkTempProject();
    fs.mkdirSync(path.join(projectRoot, "manuscript"), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "main.tex"),
      "\\documentclass{article}\n\\cite{fromBib}\n",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(projectRoot, "manuscript", "references.bib"),
      "@article{fromBib, title={Imported Title}, author={B}, year={2023}}\n",
      "utf-8",
    );

    const result = await importProjectBibKeysIntoLibrary(projectRoot);
    expect(result.imported).toBe(1);
    const health = getCitationHealth(projectRoot);
    expect(health.libraryCheck.missingKeys).toEqual([]);
  });
});
