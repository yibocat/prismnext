import { PAPER_EXTRACT_AGENT_UI_HINT } from "../../../shared/paper-extract";
import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Per-turn intensive reading block (L4 user prompt sidecar).
 *
 * Lives under `prompts/per-turn/` — not `prompts/modules/` (Knowledge Modules registry).
 * Built from the active chat tab's intensive paper list; appended each `chat:send`.
 */

export interface IntensivePaper {
  bibkey: string;
  title: string;
}

export interface IntensiveReadingOptions {
  /** User message includes ```paper …``` excerpt block(s) from PDF block pick. */
  hasPaperSnippets?: boolean;
}

/**
 * Build the intensive reading instruction block.
 * Returns "" when the list is empty (no intensive papers this turn).
 */
export function buildIntensiveReadingInstruction(
  papers: IntensivePaper[],
  options?: IntensiveReadingOptions,
): string {
  if (papers.length === 0) return "";

  const readPdfTool = TOOL_NAMES.literatureReadPdf;
  const items = papers.map((p, i) => {
    const title = p.title?.trim() || p.bibkey;
    return `${i + 1}. \`${p.bibkey}\` — ${title}`;
  });

  const rules: string[] = [
    "**Evidence priority:**",
    "- Intensive papers have extracted Markdown under `.prismnext/library/extract/`.",
    `- \`${readPdfTool}\` reads that extract (optional \`pages=\`, \`query=\`).`,
    "- Judge whether the user message already contains enough text to answer.",
  ];

  if (options?.hasPaperSnippets) {
    rules.push(
      "- **This turn:** the message includes ```paper …``` **excerpt block(s)** the user selected from the PDF. Treat them as the **primary source** for questions about those passages.",
      "- If the excerpt alone suffices (explain this formula, summarize this paragraph, etc.), answer **directly** — do not call `" +
        readPdfTool +
        "` just to repeat the same text.",
      "- Call `" +
        readPdfTool +
        "` when you **genuinely need context outside** the excerpt: earlier/later pages, other sections, paper-wide claims, symbol definitions elsewhere, or cross-references.",
    );
  } else {
    rules.push(
      "- When the question is about paper **content** and no excerpt is provided, use `" +
        readPdfTool +
        "` with the bibkey instead of guessing from abstract or metadata alone.",
      "- Narrow with `pages=` or `query=` before pulling a long extract.",
    );
  }

  rules.push(
    "- When quoting or paraphrasing PDF content, cite page numbers as `p.X`.",
    "- In your chat reply, cite the library paper inline as **`[@bibkey]`** with the exact cite key from this list — e.g. `… as shown [@Vaswani2017] (p. 4).`",
    "- Combine `[@bibkey]` with `p.X` when the answer comes from `" + readPdfTool + "` or a ```paper``` excerpt.",
    `- If \`${readPdfTool}\` reports the extract is not ready, tell the user to run ${PAPER_EXTRACT_AGENT_UI_HINT} and retry.`,
    "- These papers stay in intensive mode for the session even without @-mention each turn.",
  );

  return [
    "## Intensive reading papers (this session)",
    "",
    "The following library papers are in **intensive reading mode**:",
    "",
    ...items,
    "",
    "**Rules:**",
    "",
    ...rules,
    "",
  ].join("\n");
}
