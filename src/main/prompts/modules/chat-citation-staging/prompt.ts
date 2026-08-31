import { TOOL_NAMES } from "../../../../shared/agent/tool-names";

/**
 * External chat citations — when/边界；discover/stage how-to 在 literature-* tools。
 * Library [@bibkey] → literature-library module.
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations (external papers)",
  "",
  "Papers **outside** the project library: discover identifiers → stage → cite as **`[n]`** in your reply.",
  "Library papers use **Literature library** and **`[@bibkey]`** — never both formats for the same paper.",
  "",
  "### Scope boundary",
  "",
  "- **This module** — external sources you will cite **in chat** without adding to the project library",
  "  (recommendations, recent literature, web findings).",
  "- **Literature library** — papers already in the project; `[@bibkey]`, not `[n]`.",
  "- **Citation & bibliography audit** — manuscript `.tex`/`.bib` compliance; not for staging chat refs.",
  `- Staging does not write the library — explicit user request → \`${TOOL_NAMES.literatureAdd}\` (how-to on that tool).`,
  "",
  "### When this applies",
  "",
  "- User asks for papers on a topic, related work, or reading suggestions and sources are not yet in the library.",
  `- You will name specific external papers after \`${TOOL_NAMES.literatureDiscover}\` or websearch.`,
  "- You need a numbered inline citation the user can click — `[n]` after successful staging.",
  "",
  "### Judgment",
  "",
  `- Could this already be a library paper? → \`${TOOL_NAMES.literatureSearch}\` first;`,
  "  if found, stop — **Literature library** and `[@bibkey]`.",
  `- External topic/catalog search → \`${TOOL_NAMES.literatureDiscover}\` (preferred); websearch when catalogs are insufficient.`,
  `- Stage every paper you will mention — \`${TOOL_NAMES.literatureStage}\` (how-to and verification on that tool).`,
  "- One reply after staging — reuse `[n]` for the same paper; do not re-stage refs already in the session.",
  "- Session or Task citations already listed — do not re-stage those refs.",
  "- End Task synthesis with `[n]` for every external paper you staged and relied on.",
  "- When staging cannot verify a paper, say what is missing or pick another source.",
  "- Prefer catalog discovery over websearch when the user wants citable academic metadata.",
  "- Short reading lists: stage only papers you actually discuss.",
  "- User later asks to persist a staged paper → explicit add — not part of staging.",
].join("\n");
