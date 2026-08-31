import * as fs from "node:fs";
import { join } from "node:path";
import { extractCiteKeysFromTex } from "../../shared/literature/tex-cite-keys";
import { walkTexFiles } from "../lib/latex-root";
import { walkTypFiles } from "../lib/typst-root";
import { extractCiteKeysFromTypst } from "../../shared/literature/typst-cite-keys";

export interface ManuscriptCiteScan {
  texFilesScanned: number;
  typFilesScanned: number;
  citeKeys: string[];
}

function readRel(projectRoot: string, rel: string): string | null {
  try {
    return fs.readFileSync(join(projectRoot, rel), "utf-8");
  } catch {
    return null;
  }
}

/** Cite keys in project `.tex` and `.typ` sources (union, sorted). */
export function scanManuscriptCiteKeys(projectRoot: string): ManuscriptCiteScan {
  const texFiles = walkTexFiles(projectRoot);
  const typFiles = walkTypFiles(projectRoot);
  const keys = new Set<string>();

  for (const rel of texFiles) {
    const content = readRel(projectRoot, rel);
    if (!content) continue;
    for (const key of extractCiteKeysFromTex(content)) keys.add(key);
  }
  for (const rel of typFiles) {
    const content = readRel(projectRoot, rel);
    if (!content) continue;
    for (const key of extractCiteKeysFromTypst(content)) keys.add(key);
  }

  return {
    texFilesScanned: texFiles.length,
    typFilesScanned: typFiles.length,
    citeKeys: [...keys].sort(),
  };
}
