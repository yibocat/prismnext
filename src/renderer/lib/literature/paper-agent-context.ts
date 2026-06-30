import {
  formatEntryType,
  formatLiteratureAuthors,
  formatPaperProvenance,
} from "@/modes/literature-mode/literature-format";
import { publicationDetailRows } from "@/modes/literature-mode/literature-csl-fields";
import type { LiteraturePaper } from "@/types/electron.d";
import { noteBodyWithoutFrontmatter } from "@/lib/literature/paper-notes";

export interface PaperNoteAgentContext {
  relativePath: string;
  /** Raw file content; body is stripped of frontmatter when rendering. */
  content?: string;
}

function line(label: string, value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return `- **${label}:** ${v}`;
}

/** Relative path to cached PDF on disk (metadata only — not file contents). */
export function libraryPdfRelativePath(paper: LiteraturePaper): string | null {
  if (!paper.pdf_path?.trim()) return null;
  const normalized = paper.pdf_path.replace(/\\/g, "/");
  return `.prismnext/library/${normalized}`;
}

/**
 * Markdown block injected when the user @-mentions a library paper.
 * Includes bibliographic metadata + note paths; excludes PDF body.
 */
export function buildPaperAgentContextBlock(
  paper: LiteraturePaper,
  notes: PaperNoteAgentContext[],
): string {
  const authors = formatLiteratureAuthors(paper.authors);
  const entryType = formatEntryType(paper.type);
  const provenance = formatPaperProvenance(paper);
  const pdfPath = libraryPdfRelativePath(paper);

  const lines: string[] = [
    `### @${paper.bibkey} — ${paper.title}`,
    "",
    line("Title", paper.title),
    line("Authors", authors !== "Unknown authors" ? authors : null),
    line("Year", paper.year != null ? String(paper.year) : null),
    line("Venue", paper.venue),
    line("Type", entryType ?? paper.type),
    line("DOI", paper.doi),
    line("arXiv", paper.arxiv_id),
    line("ISBN", paper.isbn),
    line("Cite key (\\cite)", paper.bibkey),
    line("Library ID", paper.id),
    line("Source", provenance.primary + (provenance.secondary ? ` (${provenance.secondary})` : "")),
  ].filter((l): l is string => l != null);

  for (const row of publicationDetailRows(paper)) {
    lines.push(line(row.label, row.value)!);
  }

  if (pdfPath) {
    lines.push(`- **PDF file (path only, do not read unless user asks):** \`${pdfPath}\``);
  }

  lines.push("");
  lines.push("**Abstract**");
  lines.push(paper.abstract?.trim() || "(none in library)");

  if (notes.length > 0) {
    lines.push("");
    lines.push("**Reading notes (project files)**");
    for (const note of notes) {
      const body = note.content != null ? noteBodyWithoutFrontmatter(note.content) : "";
      if (body.trim()) {
        lines.push("");
        lines.push(`\`\`\`${note.relativePath}\n${body}\n\`\`\``);
      } else {
        lines.push(`- \`${note.relativePath}\` (empty)`);
      }
    }
  }

  return lines.join("\n");
}

export const PAPER_AGENT_CONTEXT_FOOTER = [
  "",
  "**Instructions:** Bibliographic metadata above is already loaded from the project literature library (`.prismnext/library/library.db`). For basic questions about this paper (title, authors, venue, abstract, reading notes), use this context first. Web search is still available when you need external or up-to-date information (related work, news, corrections, etc.). Use `literature-read` with the cite key for saved highlights and annotations. PDF full text is not included here.",
].join("\n");
