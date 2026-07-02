import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Chat citation staging workflow — behavioral rules only.
 *
 * Tool usage details live in OpenCode tool schemas (BUILTIN_TOOLS registry).
 * This module is the system-prompt binding layer: stage before [n].
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations",
  "",
  "When you recommend or cite **external papers** in chat (not LaTeX \\cite):",
  "",
  "### How to cite (binding)",
  `- For EVERY paper, call \`${TOOL_NAMES.literatureStage}\` with its exact DOI or arXiv ID **before** mentioning it in text.`,
  "- Reference the returned `refId` as **`[n]`** — e.g. `**Title** [3]` then a short summary.",
  "- Do **not** write `[n]` or a paper recommendation list until every `literature-stage` call for this turn returned a verified refId.",
  "- Use **`[n]` markers only**. Do NOT use markdown ordered lists (`1.` `2.` …) or bare numbers as citations.",
  "- If `literature-stage` returns `verified: false`, do NOT write `[n]`; ask the user for a correct identifier.",
  "- Never invent DOIs — copy exact identifiers from your discovery sources or the user message.",
  "",
  "### Topic discovery (e.g. \"recent RL papers\")",
  "- Catalog tools do not search by topic. Discover papers however you prefer, extract exact arXiv IDs/DOIs, " +
    "`literature-stage` each, then write one reply with `[n]`.",
  `- Do not call \`${TOOL_NAMES.literatureAdd}\` unless the user explicitly asks to add the paper to the library.`,
].join("\n");
