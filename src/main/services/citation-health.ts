import * as fs from "node:fs";
import { parseBibTeX } from "../lib/bibtex-parse";
import { checkBibConsistency } from "./latex-service";
import {
  citeCheckLiterature,
  findProjectBibPath,
  importBibTeX,
  mergeLibraryIntoProjectBib,
  type MergeLibraryBibResult,
} from "./literature-service";
import type { BibFallbackEntry, CitationHealthReport } from "../../shared/literature/citation-health-types";

export type { BibFallbackEntry, CitationHealthReport } from "../../shared/literature/citation-health-types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract one BibTeX entry block from file content by citekey. */
function extractBibEntryRaw(bibContent: string, citekey: string): string | null {
  const startRe = new RegExp(
    `@\\w+\\s*\\{[\\s\\n]*${escapeRegExp(citekey)}[\\s\\n]*,`,
    "i",
  );
  const start = bibContent.search(startRe);
  if (start < 0) return null;
  let depth = 0;
  const open = bibContent.indexOf("{", start);
  if (open < 0) return null;
  for (let i = open; i < bibContent.length; i++) {
    const ch = bibContent[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return bibContent.slice(start, i + 1);
    }
  }
  return null;
}

function readProjectBibContent(projectRoot: string): { bibPath: string; content: string } | null {
  try {
    const bibPath = findProjectBibPath(projectRoot);
    if (!fs.existsSync(bibPath)) return null;
    return { bibPath, content: fs.readFileSync(bibPath, "utf-8") };
  } catch {
    return null;
  }
}

function readProjectBibEntries(projectRoot: string): Map<string, ReturnType<typeof parseBibTeX>[number]> {
  const map = new Map<string, ReturnType<typeof parseBibTeX>[number]>();
  try {
    const bibPath = findProjectBibPath(projectRoot);
    if (!fs.existsSync(bibPath)) return map;
    const content = fs.readFileSync(bibPath, "utf-8");
    for (const entry of parseBibTeX(content)) {
      map.set(entry.citekey, entry);
    }
  } catch {
    // no bib yet
  }
  return map;
}

function buildBibFallback(
  missingInLibrary: string[],
  bibEntries: Map<string, ReturnType<typeof parseBibTeX>[number]>,
): BibFallbackEntry[] {
  return missingInLibrary.map((bibkey) => {
    const entry = bibEntries.get(bibkey);
    if (!entry) {
      return {
        bibkey,
        title: null,
        doi: null,
        arxivId: null,
        canImportFromBib: false,
      };
    }
    const doi = entry.fields.doi?.trim() || null;
    const arxivId =
      entry.fields.eprint?.trim() ||
      entry.fields.arxiv?.trim() ||
      null;
    return {
      bibkey,
      title: entry.fields.title?.trim() || null,
      doi,
      arxivId,
      canImportFromBib: true,
    };
  });
}

/** Unified citation health: .tex ↔ .bib ↔ library.db, with .bib metadata for library gaps. */
export function getCitationHealth(projectRoot: string): CitationHealthReport {
  const bibCheck = checkBibConsistency(projectRoot, { includeLibraryCheck: true });
  const libraryCheck = bibCheck.libraryCheck ?? citeCheckLiterature(projectRoot);
  const bibEntries = readProjectBibEntries(projectRoot);
  const bibFallback = buildBibFallback(libraryCheck.missingKeys, bibEntries);
  const libraryKeySet = new Set(libraryCheck.knownKeys);
  const bibKeysNotInLibrary = bibCheck.keysInBib.filter((k) => !libraryKeySet.has(k));
  return { bibCheck, libraryCheck, bibFallback, bibKeysNotInLibrary };
}

/** Import selected (or all resolvable) missing-in-library keys from project .bib into library.db. */
export async function importProjectBibKeysIntoLibrary(
  projectRoot: string,
  bibkeys?: string[],
): Promise<{ imported: number; skipped: number; notInBib: string[]; importedPaperIds: string[] }> {
  const bibFile = readProjectBibContent(projectRoot);
  const bibEntries = readProjectBibEntries(projectRoot);
  const missing = citeCheckLiterature(projectRoot).missingKeys;
  const targets =
    bibkeys?.length
      ? bibkeys.filter((k) => bibEntries.has(k))
      : missing.filter((k) => bibEntries.has(k));

  const notInBib =
    bibkeys?.filter((k) => !bibEntries.has(k)) ?? [];

  if (targets.length === 0 || !bibFile) {
    return { imported: 0, skipped: 0, notInBib, importedPaperIds: [] };
  }

  const rawParts = targets
    .map((k) => extractBibEntryRaw(bibFile.content, k))
    .filter((part): part is string => Boolean(part));
  if (rawParts.length === 0) {
    return { imported: 0, skipped: 0, notInBib: targets, importedPaperIds: [] };
  }

  const raw = rawParts.join("\n\n");
  const result = await importBibTeX(projectRoot, raw, undefined, { enrichAfterImport: false });
  return {
    imported: result.imported,
    skipped: result.skipped,
    notInBib,
    importedPaperIds: result.importedPaperIds,
  };
}

export function syncLibraryToManuscriptBib(
  projectRoot: string,
  options?: Parameters<typeof mergeLibraryIntoProjectBib>[1],
): MergeLibraryBibResult {
  return mergeLibraryIntoProjectBib(projectRoot, options);
}
