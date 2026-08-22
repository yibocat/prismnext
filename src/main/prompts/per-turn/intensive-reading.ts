import { TOOL_NAMES } from "../../../shared/agent/tool-names";

/**
 * Per-turn intensive reading block (L4) — bibkey list + read-pdf pointer.
 * Intensive list lives on the session; do not reprint manuals here.
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
    `- Extracts live in the project library extract cache; use \`${readPdfTool}\` (optional \`pages=\` / \`query=\`). Gate is enforced by the tool.`,
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
    `- If extract is not ready, call \`${readPdfTool}\` with \`force=true\` to start background extraction, then retry — do not ask the user to run it manually.`,
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
