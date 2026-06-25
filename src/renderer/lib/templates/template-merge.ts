// ─── Template Merge Library ───
// Pure functions for content-preserving template switching.

/** Compatibility level for switching between template categories. */
export type CompatibilityLevel = "L1" | "L2" | "L3";

export type SwitchDialogLevel = CompatibilityLevel | "reset" | "firstUse";

export type TemplateSwitchAction = "merge" | "replace" | "silent";

export interface TemplateSwitchStrategy {
  level: SwitchDialogLevel;
  /** Actions shown in the confirmation dialog (empty = no dialog). */
  dialogActions: ("merge" | "replace")[];
  /** Default path when no user edits exist. */
  silentAction: "replace";
}

export const NON_MERGE_CATEGORIES = new Set(["letter", "beamer", "poster", "cv"]);

const L2_PAIRS: [string, string][] = [["paper", "thesis"]];

/** Categories that support section-aware merge (paper / thesis only). */
export function supportsSectionMerge(category: string): boolean {
  return category === "paper" || category === "thesis";
}

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

/**
 * Full switch strategy including whether merge is offered.
 */
export function getTemplateSwitchStrategy(
  oldCategory: string,
  newCategory: string,
  options: {
    sameTemplate: boolean;
    hasChanges: boolean;
    isFirstUse: boolean;
  },
): TemplateSwitchStrategy {
  if (options.isFirstUse) {
    return { level: "firstUse", dialogActions: ["replace"], silentAction: "replace" };
  }
  if (options.sameTemplate) {
    if (!options.hasChanges) {
      return { level: "L1", dialogActions: [], silentAction: "replace" };
    }
    return { level: "reset", dialogActions: ["replace"], silentAction: "replace" };
  }
  if (!options.hasChanges) {
    return { level: "L1", dialogActions: [], silentAction: "replace" };
  }

  const nonMerge =
    NON_MERGE_CATEGORIES.has(oldCategory) || NON_MERGE_CATEGORIES.has(newCategory);
  if (nonMerge) {
    return { level: "L3", dialogActions: ["replace"], silentAction: "replace" };
  }

  const level = getCompatibilityLevel(oldCategory, newCategory);
  if (level === "L3") {
    return { level: "L3", dialogActions: ["replace"], silentAction: "replace" };
  }
  if (level === "L2") {
    return { level: "L2", dialogActions: ["merge", "replace"], silentAction: "replace" };
  }
  return { level: "L1", dialogActions: ["merge", "replace"], silentAction: "replace" };
}

// ─── Body Extraction ───

const BEGIN_DOC = /\\begin\{document\}/;
const END_DOC = /\\end\{document\}/;

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
  heading: string;
  name: string;
  content: string;
  raw: string;
  start: number;
  end: number;
}

const SECTION_RE =
  /\\(?:section|subsection|chapter|section\*|subsection\*|chapter\*)(?:\[[^\]]*\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g;

export function parseSections(body: string): Section[] {
  const sections: Section[] = [];
  const matches: { name: string; index: number; endIndex: number }[] = [];

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
    sections.push({
      heading: "",
      name: "",
      content: body,
      raw: body,
      start: 0,
      end: body.length,
    });
    return sections;
  }

  const firstMatch = matches[0];
  const beforeFirst = body.slice(0, firstMatch.index);
  if (beforeFirst.trim().length > 0) {
    sections.push({
      heading: "",
      name: "",
      content: beforeFirst,
      raw: beforeFirst,
      start: 0,
      end: firstMatch.index,
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const heading = body.slice(m.index, m.endIndex);
    const contentStart = m.endIndex;
    const contentEnd = i < matches.length - 1 ? matches[i + 1].index : body.length;
    const content = body.slice(contentStart, contentEnd);
    sections.push({
      heading,
      name: m.name.toLowerCase(),
      content,
      raw: body.slice(m.index, contentEnd),
      start: m.index,
      end: contentEnd,
    });
  }

  return sections;
}

// ─── Section Merging ───

/**
 * Rebuild body by splicing sections at exact indices (avoids String.replace pitfalls).
 */
function rebuildBodyWithReplacements(
  body: string,
  replacements: { start: number; end: number; text: string }[],
): string {
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let result = body;
  for (const r of sorted) {
    result = result.slice(0, r.start) + r.text + result.slice(r.end);
  }
  return result;
}

export function mergeSections(oldBody: string, newBody: string): string {
  const oldSections = parseSections(oldBody);
  const newSections = parseSections(newBody);

  const oldContentMap = new Map<string, string>();
  for (const sec of oldSections) {
    if (sec.name) {
      oldContentMap.set(sec.name, sec.content);
    }
  }

  const matchedOldNames = new Set<string>();
  const replacements: { start: number; end: number; text: string }[] = [];

  // Preamble blocks (abstract, maketitle, etc.)
  const oldPreamble = oldSections.find((s) => !s.name);
  const newPreamble = newSections.find((s) => !s.name);
  if (oldPreamble && newPreamble && oldPreamble.content.trim().length > 0) {
    replacements.push({
      start: newPreamble.start,
      end: newPreamble.end,
      text: oldPreamble.raw,
    });
  }

  for (const newSec of newSections) {
    if (!newSec.name) continue;
    const oldContent = oldContentMap.get(newSec.name);
    if (oldContent !== undefined) {
      matchedOldNames.add(newSec.name);
      replacements.push({
        start: newSec.start,
        end: newSec.end,
        text: newSec.heading + oldContent,
      });
    }
  }

  let result = rebuildBodyWithReplacements(newBody, replacements);

  for (const oldSec of oldSections) {
    if (!oldSec.name) continue;
    if (!matchedOldNames.has(oldSec.name)) {
      result = result.trimEnd() + "\n\n" + oldSec.raw;
    }
  }

  return result;
}

export function mergeFile(
  oldContent: string,
  newContent: string,
  filePath: string,
  hasUserChanges: boolean,
  templateCategory: string,
): string {
  const isTex = filePath.endsWith(".tex");
  if (!isTex) {
    return hasUserChanges ? oldContent : newContent;
  }

  if (!hasUserChanges) {
    return newContent;
  }

  if (!supportsSectionMerge(templateCategory)) {
    return newContent;
  }

  const oldSplit = splitDocument(oldContent);
  const newSplit = splitDocument(newContent);

  if (!oldSplit || !newSplit) {
    return newContent;
  }

  const mergedBody = mergeSections(oldSplit.body, newSplit.body);
  const END_DOC_PATTERN = /\n?\\end\{document\}\s*$/;
  const cleanBody = mergedBody.replace(END_DOC_PATTERN, "");

  return newSplit.preamble + "\n" + cleanBody + "\n\\end{document}\n";
}
