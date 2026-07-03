import type { StagedCitation } from "@shared/citation-staging";

const APPENDIX_MARKER = "## Session citations (this chat)";

function oneLineSummary(text: string | null | undefined, max = 160): string {
  const line = (text || "").replace(/\s+/g, " ").trim();
  if (!line) return "—";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

export function formatSessionCitationsMarkdown(citations: StagedCitation[]): string {
  if (citations.length === 0) return "";
  const sorted = [...citations].sort((a, b) => a.refId - b.refId);
  const lines = [
    APPENDIX_MARKER,
    "",
    "These papers were verified via `literature-stage` in this chat. **Cite as `[n]`** in your reply.",
    "Do **not** call `literature-stage` again for the same paper or re-delegate literature search unless the user asks.",
    "",
    "| refId | Title | Year | Summary |",
    "|------:|-------|-----:|---------|",
  ];
  for (const c of sorted) {
    const title = (c.title || c.doi || c.arxivId || "Unknown").replace(/\|/g, "\\|");
    const year = c.year != null ? String(c.year) : "—";
    const summary = oneLineSummary(c.abstract).replace(/\|/g, "\\|");
    lines.push(`| ${c.refId} | ${title} | ${year} | ${summary} |`);
  }
  return lines.join("\n");
}

export function enrichTaskToolResultFromStore(
  sessionId: string,
  citations: StagedCitation[],
  content: unknown,
): string {
  const base =
    typeof content === "string"
      ? content
      : content == null
        ? ""
        : JSON.stringify(content, null, 2);
  if (!base.trim()) return base;
  if (base.includes(APPENDIX_MARKER)) return base;
  const appendix = formatSessionCitationsMarkdown(citations);
  if (!appendix) return base;
  return `${base.trimEnd()}\n\n${appendix}`;
}
