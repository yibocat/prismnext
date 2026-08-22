import {
  formatEntryType,
  formatLiteratureAuthors,
  formatPaperProvenance,
} from "@/lib/literature/literature-format";
import { publicationDetailRows } from "@/modes/literature-mode/literature-csl-fields";
import type { LiteraturePaper } from "@/types/electron.d";
import { noteBodyWithoutFrontmatter } from "@/lib/literature/paper-notes";
import { TOOL_NAMES } from "../../../shared/agent/tool-names";

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
  return `library/${normalized}`;
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

  const tags = paper.tags ?? [];
  if (tags.length > 0) {
    lines.push("");
    lines.push("**Tags**");
    lines.push(tags.join(", "));
  }

  if (paper.ai_summary?.trim()) {
    lines.push("");
    lines.push("**AI Summary**");
    lines.push(paper.ai_summary.trim());
  }

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
  "**Instructions:** Bibliographic metadata above is already loaded from the project literature library. " +
    "Tags and AI Summary are project-local (not from external catalogs). " +
    `For other papers or tag-based discovery, use \`${TOOL_NAMES.literatureSearch}\` (optional \`tag=\`) or \`${TOOL_NAMES.literatureRead}\` with a cite key. ` +
    `For highlights or annotations on this paper, use \`${TOOL_NAMES.literatureRead}\`. ` +
    "Web search remains available for external information. " +
    `Do NOT read the PDF body for this paper unless it is in the intensive reading list.`,
].join("\n");
