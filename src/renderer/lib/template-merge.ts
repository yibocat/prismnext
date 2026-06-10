// ─── Template Merge Library ───
// Pure functions for content-preserving template switching.
// All functions are synchronous and side-effect-free.

/** Compatibility level for switching between template categories. */
export type CompatibilityLevel = "L1" | "L2" | "L3";

const L2_PAIRS: [string, string][] = [["paper", "thesis"]];

/**
 * Determine the compatibility level when switching from oldCategory to newCategory.
 */
export function getCompatibilityLevel(
  oldCategory: string,
  newCategory: string,
): CompatibilityLevel {
  if (oldCategory === newCategory) return "L1";
  const pair = [oldCategory, newCategory].sort() as [string, string];
  if (L2_PAIRS.some(([a, b]) => a === pair[0] && b === pair[1])) return "L2";
  return "L3";
}

// ─── Body Extraction ───

const BEGIN_DOC = /\\begin\{document\}/;
const END_DOC = /\\end\{document\}/;

/**
 * Split a .tex file into preamble (everything before \begin{document})
 * and body (between \begin{document} and \end{document}).
 * Returns null if the document structure cannot be parsed.
 */
export function splitDocument(
  content: string,
): { preamble: string; body: string } | null {
  const beginMatch = BEGIN_DOC.exec(content);
  if (!beginMatch) return null;
  const endMatch = END_DOC.exec(content);
  if (!endMatch) return null;
  if (endMatch.index < beginMatch.index + beginMatch[0].length) return null;

  const preamble = content.slice(0, beginMatch.index + beginMatch[0].length);
  const body = content.slice(
    beginMatch.index + beginMatch[0].length,
    endMatch.index,
  );
  return { preamble, body };
}

// ─── Section Parsing ───

interface Section {
  /** The full heading line (e.g., "\section{Introduction}") */
  heading: string;
  /** Normalized name for matching (lowercase, trimmed) */
  name: string;
  /** Content between this heading and the next heading (or end) */
  content: string;
  /** The raw source text for this entire section (heading + content) */
  raw: string;
}

// Handle optional [ToC Title] and one level of nested braces in section names
const SECTION_RE = /\\(?:section|subsection|chapter|section\*|subsection\*|chapter\*)(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/**
 * Parse body content into an ordered list of sections.
 * Content before the first section heading is treated as "preamble" content
 * (e.g., \maketitle, \begin{abstract}...\end{abstract}) and returned as the
 * first item with an empty name.
 */
export function parseSections(body: string): Section[] {
  const sections: Section[] = [];
  const matches: { name: string; index: number; endIndex: number }[] = [];

  // Find all section headings with their positions
  let match: RegExpExecArray | null;
  SECTION_RE.lastIndex = 0;
  while ((match = SECTION_RE.exec(body)) !== null) {
    matches.push({
      name: match[1].trim(),
      index: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  if (matches.length === 0) {
    // No sections found — treat entire body as one block
    sections.push({
      heading: "",
      name: "",
      content: body,
      raw: body,
    });
    return sections;
  }

  // Content before first section heading
  const firstMatch = matches[0];
  const beforeFirst = body.slice(0, firstMatch.index).trim();
  if (beforeFirst.length > 0) {
    sections.push({
      heading: "",
      name: "",
      content: beforeFirst,
      raw: beforeFirst,
    });
  }

  // Process each section
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const heading = body.slice(m.index, m.endIndex);
    // Content from after this heading to before the next heading (or end)
    const contentStart = m.endIndex;
    const contentEnd = i < matches.length - 1 ? matches[i + 1].index : body.length;
    const content = body.slice(contentStart, contentEnd);
    sections.push({
      heading,
      name: m.name.toLowerCase(),
      content,
      raw: body.slice(m.index, contentEnd),
    });
  }

  return sections;
}

// ─── Section Merging ───

/**
 * Merge old user sections into a new template's body.
 *
 * Rules:
 * 1. For each section in newBody that matches an old section by name:
 *    replace the template placeholder with the user's content.
 * 2. New-only sections: keep template placeholder.
 * 3. Old-only sections: append at the end (before \end{document}).
 */
export function mergeSections(
  oldBody: string,
  newBody: string,
): string {
  const oldSections = parseSections(oldBody);
  const newSections = parseSections(newBody);

  // Build lookup: normalized name → user content
  const oldContentMap = new Map<string, string>();
  for (const sec of oldSections) {
    if (sec.name) {
      oldContentMap.set(sec.name, sec.content);
    }
  }

  // Track which old sections were matched
  const matchedOldNames = new Set<string>();

  // Rebuild new body with matched content replaced
  let result = newBody;
  for (const newSec of newSections) {
    if (!newSec.name) continue;
    const oldContent = oldContentMap.get(newSec.name);
    if (oldContent !== undefined) {
      matchedOldNames.add(newSec.name);
      // Replace the content after the heading in the template
      // Escape $ in replacement to avoid String.replace interpreting $&, $`, $', $$
      const safeContent = (newSec.heading + oldContent).replace(/\$/g, "$$$$");
      result = result.replace(newSec.raw, safeContent);
    }
  }

  // Append unmatched old sections
  for (const oldSec of oldSections) {
    if (!oldSec.name) continue;
    if (!matchedOldNames.has(oldSec.name)) {
      result = result.trimEnd() + "\n\n" + oldSec.raw;
    }
  }

  return result;
}

// ─── Full Merge (for a single file) ───

/**
 * Merge user content from oldContent into a new template file.
 * For .tex files: preamble swap + section-aware body merge.
 * For non-.tex files: keep user's version if it exists and differs.
 *
 * @param oldContent - Current file content on disk (may be empty if new file)
 * @param newContent - Template file content from the new template
 * @param filePath - Relative file path (used to check extension)
 * @param hasUserChanges - Whether this file was modified by the user
 * @returns The merged content
 */
export function mergeFile(
  oldContent: string,
  newContent: string,
  filePath: string,
  hasUserChanges: boolean,
): string {
  const isTex = filePath.endsWith(".tex");
  if (!isTex) {
    // Non-.tex files: keep user's version if modified, else use template
    return hasUserChanges ? oldContent : newContent;
  }

  if (!hasUserChanges) {
    // User hasn't touched this file — use new template content as-is
    return newContent;
  }

  // Try A+B merge for .tex files with user changes
  const oldSplit = splitDocument(oldContent);
  const newSplit = splitDocument(newContent);

  if (!oldSplit || !newSplit) {
    // Fallback: can't parse structure — return new template content
    // (caller should have created a backup)
    return newContent;
  }

  const mergedBody = mergeSections(oldSplit.body, newSplit.body);

  // Remove any existing \end{document} from merged body before appending
  const END_DOC_PATTERN = /\n?\\end\{document\}\s*$/;
  const cleanBody = mergedBody.replace(END_DOC_PATTERN, "");

  return newSplit.preamble + "\n" + cleanBody + "\n\\end{document}\n";
}
