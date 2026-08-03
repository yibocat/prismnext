import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LEGACY_RESEARCH_BRIEF_REL,
  RESEARCH_BRIEF_REL,
  RESEARCH_BRIEF_SECTIONS,
  RESEARCH_BRIEF_TEMPLATE,
  resolveResearchBriefSection,
  type ResearchBriefSection,
} from "../../shared/research-brief";

export function researchBriefAbsPath(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), RESEARCH_BRIEF_REL);
}

function legacyResearchBriefAbsPath(projectRoot: string): string {
  return join(projectRoot.replace(/\\/g, "/"), LEGACY_RESEARCH_BRIEF_REL);
}

/**
 * Move `.prismnext/research/brief.md` → project-root `.brief.md` when needed.
 * Never overwrites an existing root brief.
 */
function migrateLegacyResearchBrief(projectRoot: string): boolean {
  const abs = researchBriefAbsPath(projectRoot);
  if (existsSync(abs)) return false;
  const legacyAbs = legacyResearchBriefAbsPath(projectRoot);
  if (!existsSync(legacyAbs)) return false;
  mkdirSync(dirname(abs), { recursive: true });
  renameSync(legacyAbs, abs);
  return true;
}

/**
 * Idempotent: create project-root `.brief.md` when missing.
 * Migrates the pre-0.6.8 path once. Never overwrites an existing brief.
 */
export function ensureResearchBrief(projectRoot: string): { created: boolean; path: string } {
  migrateLegacyResearchBrief(projectRoot);
  const abs = researchBriefAbsPath(projectRoot);
  if (existsSync(abs)) {
    return { created: false, path: RESEARCH_BRIEF_REL };
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, RESEARCH_BRIEF_TEMPLATE, "utf-8");
  return { created: true, path: RESEARCH_BRIEF_REL };
}

export function parseResearchBriefSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = raw.split("\n");
  let current: string | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current !== null) {
      sections[current] = buffer.join("\n").trim();
    }
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      flush();
      current = h2[1]!.trim();
      buffer.length = 0;
      continue;
    }
    if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

export interface ResearchBriefReadResult {
  path: string;
  exists: boolean;
  raw: string;
  sections: Record<string, string>;
  sectionNames: readonly ResearchBriefSection[];
  lastModified: string | null;
  created?: boolean;
}

export function readResearchBrief(projectRoot: string, options?: { ensure?: boolean }): ResearchBriefReadResult {
  if (options?.ensure) {
    ensureResearchBrief(projectRoot);
  } else {
    migrateLegacyResearchBrief(projectRoot);
  }
  const abs = researchBriefAbsPath(projectRoot);
  if (!existsSync(abs)) {
    return {
      path: RESEARCH_BRIEF_REL,
      exists: false,
      raw: "",
      sections: {},
      sectionNames: RESEARCH_BRIEF_SECTIONS,
      lastModified: null,
    };
  }
  const raw = readFileSync(abs, "utf-8");
  let lastModified: string | null = null;
  try {
    lastModified = statSync(abs).mtime.toISOString();
  } catch {
    lastModified = null;
  }
  return {
    path: RESEARCH_BRIEF_REL,
    exists: true,
    raw,
    sections: parseResearchBriefSections(raw),
    sectionNames: RESEARCH_BRIEF_SECTIONS,
    lastModified,
  };
}

export interface ResearchBriefUpdateResult {
  path: string;
  section: ResearchBriefSection;
  append: boolean;
  ok: boolean;
  error?: string;
  lastModified: string | null;
}

function replaceSectionBody(raw: string, section: ResearchBriefSection, newBody: string): string {
  const lines = raw.split("\n");
  const out: string[] = [];
  let inTarget = false;
  let replaced = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      const title = h2[1]!.trim();
      if (inTarget) {
        inTarget = false;
      }
      if (title === section) {
        inTarget = true;
        replaced = true;
        out.push(line);
        i += 1;
        const bodyLines = newBody.split("\n");
        for (const bl of bodyLines) out.push(bl);
        while (i < lines.length) {
          const peek = lines[i]!;
          if (/^##\s+/.test(peek)) break;
          i += 1;
        }
        continue;
      }
    }
    if (!inTarget) {
      out.push(line);
    }
    i += 1;
  }

  if (!replaced) {
    out.push("", `## ${section}`, newBody);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

export function updateResearchBriefSection(
  projectRoot: string,
  sectionRaw: string,
  content: string,
  options?: { append?: boolean },
): ResearchBriefUpdateResult {
  const section = resolveResearchBriefSection(sectionRaw);
  if (!section) {
    return {
      path: RESEARCH_BRIEF_REL,
      section: RESEARCH_BRIEF_SECTIONS[0],
      append: false,
      ok: false,
      error: `Unknown section "${sectionRaw}". Valid sections: ${RESEARCH_BRIEF_SECTIONS.join(", ")}`,
      lastModified: null,
    };
  }

  ensureResearchBrief(projectRoot);
  const abs = researchBriefAbsPath(projectRoot);
  const existing = readFileSync(abs, "utf-8");
  const parsed = parseResearchBriefSections(existing);
  const prior = parsed[section] ?? "";
  const trimmedContent = content.trim();
  const newBody = options?.append
    ? prior.trim()
      ? `${prior.trim()}\n\n${trimmedContent}`
      : trimmedContent
    : trimmedContent;

  const next = replaceSectionBody(existing, section, newBody);
  writeFileSync(abs, next, "utf-8");

  let lastModified: string | null = null;
  try {
    lastModified = statSync(abs).mtime.toISOString();
  } catch {
    lastModified = null;
  }

  return {
    path: RESEARCH_BRIEF_REL,
    section,
    append: options?.append === true,
    ok: true,
    lastModified,
  };
}
