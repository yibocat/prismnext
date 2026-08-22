import * as fs from "node:fs";
import * as path from "node:path";
import type { PaperExtractSource } from "../../shared/literature/paper-extract";
import { EXTRACT_SOURCE_PRIORITY } from "../../shared/literature/paper-extract";
import { AI_METADATA_KEYWORD_MAX } from "../../shared/literature/ai-metadata";
import { getLibraryPaths } from "./literature-service";
import { getPaper, updatePaper } from "./literature-service";
import {
  getPaperExtractState,
  readExtractMarkdown,
} from "./paper-extract-db";

const ABSTRACT_START = /^(abstract|summary|摘要)\s*$/im;
const ABSTRACT_STOP =
  /^(keywords?|key words|index terms|introduction|\d+\.?\s+introduction)\s*$/im;
const KEYWORDS_LINE = /^(keywords?|key words|index terms)\s*[:：]\s*(.+)$/im;

export function extractAbstractFromMarkdown(md: string): string | null {
  const lines = md.replace(/\r/g, "").split("\n");
  let capturing = false;
  const buf: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!capturing && ABSTRACT_START.test(t)) {
      capturing = true;
      continue;
    }
    if (capturing && ABSTRACT_STOP.test(t)) break;
    if (capturing && t) buf.push(t);
  }
  const text = buf.join(" ").trim();
  return text.length >= 40 ? text : null;
}

export function extractKeywordHintsFromText(text: string): string[] {
  const match = text.match(KEYWORDS_LINE);
  if (!match?.[2]) return [];
  return match[2]
    .split(/[,;|·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, AI_METADATA_KEYWORD_MAX);
}

export function loadBestExtractMarkdown(
  projectRoot: string,
  paperId: string,
): { markdown: string; source: PaperExtractSource } | null {
  for (const source of EXTRACT_SOURCE_PRIORITY) {
    const state = getPaperExtractState(projectRoot, paperId, source);
    if (state?.status !== "ready") continue;
    const markdown = readExtractMarkdown(projectRoot, state);
    if (markdown?.trim()) return { markdown, source };
  }
  return null;
}

export function heuristicAbstractAndKeywords(
  projectRoot: string,
  paperId: string,
): { abstract: string | null; keywordHints: string[] } {
  const loaded = loadBestExtractMarkdown(projectRoot, paperId);
  if (!loaded) return { abstract: null, keywordHints: [] };
  const abstract = extractAbstractFromMarkdown(loaded.markdown);
  const keywordHints = extractKeywordHintsFromText(loaded.markdown);
  return { abstract, keywordHints };
}

/** Persist heuristic abstract from ready extract when the library row has none yet. */
export function backfillPaperAbstractFromExtract(
  projectRoot: string,
  paperId: string,
): boolean {
  const paper = getPaper(projectRoot, paperId);
  if (!paper || paper.abstract?.trim()) return false;

  const heuristics = heuristicAbstractAndKeywords(projectRoot, paperId);
  const abstract = heuristics.abstract?.trim();
  if (!abstract) return false;

  updatePaper(projectRoot, paperId, { abstract });
  return true;
}

/** Read first ~12k chars of best extract for debugging — unused in v1 pipeline. */
export function readExtractSnippet(projectRoot: string, paperId: string, maxChars = 12000): string | null {
  const loaded = loadBestExtractMarkdown(projectRoot, paperId);
  if (!loaded) return null;
  return loaded.markdown.slice(0, maxChars);
}

export function extractBlocksJsonExists(projectRoot: string, paperId: string, source: PaperExtractSource): boolean {
  const rel = `${paperId}/${source}.blocks.json`;
  const abs = path.join(getLibraryPaths(projectRoot).extractDir, rel);
  return fs.existsSync(abs);
}
