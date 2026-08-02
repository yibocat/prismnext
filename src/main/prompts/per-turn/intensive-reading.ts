import { PAPER_EXTRACT_AGENT_UI_HINT } from "../../../shared/paper-extract";
import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Per-turn intensive reading block (L4) — bibkey list + short evidence rules.
 * Gate is HARD in literature-bridge; do not reprint manuals here.
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
    `- Extracts live under \`.prismnext/library/extract/\`; use \`${readPdfTool}\` (optional \`pages=\` / \`query=\`). Gate is enforced by the tool.`,
    "- Cite library papers as **`[@bibkey]`**; add `p.X` when quoting PDF / excerpt text.",
    "- When extracted text includes figures and a chart or diagram clarifies your answer, embed it with `![caption](path)` or `[@bibkey|images/fig-0.png]` — optional; use your judgment.",
  ];

  if (options?.hasPaperSnippets) {
    rules.push(
      "- This turn includes ```paper``` excerpt(s) — prefer them; call `" +
        readPdfTool +
        "` only if you need context outside the excerpt.",
    );
  } else {
    rules.push(
      `- For paper **content** questions, call \`${readPdfTool}\` instead of guessing from abstract alone.`,
    );
  }

  rules.push(
    `- If extract is not ready, tell the user to run ${PAPER_EXTRACT_AGENT_UI_HINT} and retry.`,
  );

  return [
    "## Intensive reading papers (this session)",
    "",
    ...items,
    "",
    ...rules,
    "",
  ].join("\n");
}
