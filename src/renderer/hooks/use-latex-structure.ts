import { useEffect, useRef, useState } from "react";
import type { ProjectFile } from "@/stores/document-store";
import { TOC_PARSE_DEBOUNCE } from "@/styles/constants";

// ─── Types ───

export interface TocEntry {
  level: number; // 1 = section, 2 = subsection, 3 = subsubsection
  title: string;
  fileId: string;
  line: number;
  children: TocEntry[];
}

export interface LabelEntry {
  name: string;
  kind: "section" | "figure" | "table" | "equation" | "other";
  fileId: string;
  line: number;
}

export interface CitationEntry {
  key: string;
  fileId: string;
  line: number;
  /** Resolved from .bib: author, title, year */
  author?: string;
  title?: string;
  year?: string;
  entryType?: string; // article, book, inproceedings, etc.
}

export interface FigureTableEntry {
  type: "figure" | "table";
  label: string;
  caption: string;
  fileId: string;
  line: number;
}

export interface TodoEntry {
  kind: "TODO" | "FIXME" | "HACK";
  text: string;
  fileId: string;
  line: number;
}

export interface TeXStructure {
  toc: TocEntry[];
  labels: LabelEntry[];
  citations: CitationEntry[];
  figureTables: FigureTableEntry[];
  todos: TodoEntry[];
  /** .tex files only, keyed by file ID */
  texFiles: ProjectFile[];
}

// ─── Parsers ───

const SECTION_RE = /^\\(section|subsection|subsubsection)\{([^}]*)\}/;
const LABEL_RE = /\\label\{([^}]+)\}/g;
const CITE_RE = /\\cite\{([^}]+)\}/g;
const INPUT_RE = /\\input\{([^}]+)\}/g;

function sectionLevel(cmd: string): number {
  if (cmd === "section") return 1;
  if (cmd === "subsection") return 2;
  if (cmd === "subsubsection") return 3;
  return 4;
}

function labelKind(line: string, _content: string, _lineIdx: number): LabelEntry["kind"] {
  const lower = line.toLowerCase();
  if (lower.includes("\\begin{figure}") || lower.includes("\\caption{")) return "figure";
  if (lower.includes("\\begin{table}")) return "table";
  if (lower.includes("\\begin{equation}") || lower.includes("\\begin{align}") || lower.includes("\\["))
    return "equation";
  if (/\\(sub)?section\{/.test(line)) return "section";
  return "other";
}

function parseSections(lines: string[], fileId: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SECTION_RE);
    if (!m) continue;
    entries.push({
      level: sectionLevel(m[1]),
      title: m[2].trim(),
      fileId,
      line: i + 1,
      children: [],
    });
  }
  // Build tree from flat list
  const root: TocEntry[] = [];
  const stack: TocEntry[] = [];
  for (const entry of entries) {
    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(entry);
    } else {
      stack[stack.length - 1].children.push(entry);
    }
    stack.push(entry);
  }
  return root;
}

function parseLabels(lines: string[], fileId: string): LabelEntry[] {
  const result: LabelEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    LABEL_RE.lastIndex = 0;
    while ((m = LABEL_RE.exec(lines[i])) !== null) {
      // Look back 5 lines for context to determine kind
      const contextStart = Math.max(0, i - 5);
      const context = lines.slice(contextStart, i + 1).join("\n");
      result.push({
        name: m[1],
        kind: labelKind(context, lines.join("\n"), i),
        fileId,
        line: i + 1,
      });
    }
  }
  return result;
}

function parseCitations(lines: string[], fileId: string): CitationEntry[] {
  const result: CitationEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    CITE_RE.lastIndex = 0;
    while ((m = CITE_RE.exec(lines[i])) !== null) {
      // \cite{key1,key2,key3} — split on commas
      for (const key of m[1].split(",")) {
        const trimmed = key.trim();
        if (trimmed) {
          result.push({ key: trimmed, fileId, line: i + 1 });
        }
      }
    }
  }
  return result;
}

// ── Figure / Table parser ──

const FIGURE_RE = /\\begin\{(figure|table)\}/;
const CAPTION_RE = /\\caption(?:\[[^\]]*\])?\{([^}]*)\}/;

function parseFigureTables(lines: string[], fileId: string): FigureTableEntry[] {
  const result: FigureTableEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FIGURE_RE);
    if (!m) continue;
    const type = m[1] as "figure" | "table";
    let label = "";
    let caption = "";
    // Scan forward to the matching \end{type}
    for (let j = i; j < lines.length && !lines[j].includes(`\\end{${type}}`); j++) {
      if (!label) {
        let lm: RegExpExecArray | null;
        LABEL_RE.lastIndex = 0;
        if ((lm = LABEL_RE.exec(lines[j])) !== null) {
          label = lm[1];
        }
      }
      if (!caption) {
        const cm = lines[j].match(CAPTION_RE);
        if (cm) caption = cm[1].trim().slice(0, 80);
      }
    }
    result.push({
      type,
      label,
      caption: caption || "(no caption)",
      fileId,
      line: i + 1,
    });
  }
  return result;
}

// ── TODO / FIXME / HACK parser ──

const TODO_RE = /%\s*(TODO|FIXME|HACK)\b\s*(.*)/i;

function parseTodos(lines: string[], fileId: string): TodoEntry[] {
  const result: TodoEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TODO_RE);
    if (!m) continue;
    result.push({
      kind: m[1].toUpperCase() as TodoEntry["kind"],
      text: m[2].trim().slice(0, 120) || "(no description)",
      fileId,
      line: i + 1,
    });
  }
  return result;
}

// ── BibTeX parser ──

const BIB_ENTRY_RE = /@(\w+)\s*\{\s*([^,]+)\s*,/;
const BIB_FIELD_RE = /\b(author|title|year)\s*=\s*[\{"]\s*([^}"\n]*?)\s*[\}"]\s*,?/gi;

function parseBibEntries(content: string): Map<string, { entryType: string; author?: string; title?: string; year?: string }> {
  const map = new Map<string, { entryType: string; author?: string; title?: string; year?: string }>();
  // Split by @ to find entries
  const chunks = content.split(/(?=@\w+\s*\{)/);
  for (const chunk of chunks) {
    const m = chunk.match(BIB_ENTRY_RE);
    if (!m) continue;
    const [_full, entryType, key] = m; // eslint-disable-line @typescript-eslint/no-unused-vars
    const trimmedKey = key.trim();
    const fields: { author?: string; title?: string; year?: string } = {};
    let fm: RegExpExecArray | null;
    BIB_FIELD_RE.lastIndex = 0;
    while ((fm = BIB_FIELD_RE.exec(chunk)) !== null) {
      const fieldName = fm[1].toLowerCase();
      const fieldValue = fm[2].trim();
      if (fieldName === "author") fields.author = fieldValue;
      else if (fieldName === "title") fields.title = fieldValue;
      else if (fieldName === "year") fields.year = fieldValue;
    }
    map.set(trimmedKey, { entryType: entryType.trim(), ...fields });
  }
  return map;
}

// ── Hook ──

function computeStructure(
  files: ProjectFile[],
  getAsset: (id: string) => string,
): TeXStructure {
  const texFiles = files.filter((f) => f.name.endsWith(".tex"));

  const toc: TocEntry[] = [];
  const labels: LabelEntry[] = [];
  const citations: CitationEntry[] = [];
  const figureTables: FigureTableEntry[] = [];
  const todos: TodoEntry[] = [];

  for (const file of texFiles) {
    const content = getAsset(file.id);
    if (!content) continue;
    const lines = content.split("\n");

    toc.push(...parseSections(lines, file.id));
    labels.push(...parseLabels(lines, file.id));
    citations.push(...parseCitations(lines, file.id));
    figureTables.push(...parseFigureTables(lines, file.id));
    todos.push(...parseTodos(lines, file.id));
  }

  // Parse .bib files and match with citation keys
  const bibFiles = files.filter((f) => f.name.endsWith(".bib"));
  const bibMap = new Map<string, { entryType: string; author?: string; title?: string; year?: string }>();
  for (const bibFile of bibFiles) {
    const content = getAsset(bibFile.id);
    if (!content) continue;
    const entries = parseBibEntries(content);
    for (const [key, entry] of entries) {
      bibMap.set(key, entry);
    }
  }

  // Enrich citations with bib data
  const enrichedCitations = citations.map((c) => {
    const bib = bibMap.get(c.key);
    if (!bib) return c;
    return { ...c, author: bib.author, title: bib.title, year: bib.year, entryType: bib.entryType };
  });

  const seen = new Set<string>();
  const deduped = enrichedCitations.filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });

  return { toc, labels, citations: deduped, figureTables, todos, texFiles };
}

export function useLatexStructure(
  files: ProjectFile[],
  getAsset: (id: string) => string,
): TeXStructure {
  const [structure, setStructure] = useState<TeXStructure>(
    () => computeStructure(files, getAsset),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStructure(computeStructure(files, getAsset));
    }, TOC_PARSE_DEBOUNCE);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [files, getAsset]);

  return structure;
}
