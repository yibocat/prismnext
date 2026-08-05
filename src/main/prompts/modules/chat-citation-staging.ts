import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * External chat citations — papers not in the project library, cited as [n].
 * Staging rules and verified:false handling live on literature-stage tool description.
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations (external papers)",
  "",
  "For papers **outside** the project library: discover identifiers → stage → cite as **`[n]`** in your reply.",
  "For library papers, use the **Literature library** module and **`[@bibkey]`** instead — never both formats for the same paper.",
  "",
  "### Scope boundary",
  "",
  "- **This module** — recommendations, recent literature, web findings, or any external source you will",
  "  cite **in chat** without adding to `.prismnext/library/`.",
  "- **Literature library** — papers already in the project; use `[@bibkey]`, not `[n]`.",
  "- **Citation & bibliography audit** — compliance of manuscript `.tex`/`.bib`; not for staging chat refs.",
  "- Adding to the library is a separate explicit user request — staging alone does not write the library.",
  "",
  "### When this applies",
  "",
  "- User asks for papers on a topic, related work, or \"what should I read\" and sources are not yet in the library.",
  "- You used `" +
    TOOL_NAMES.literatureDiscover +
    "` or websearch and will **name specific papers** in your reply.",
  "- You need a numbered inline citation the user can click — `[n]` after successful staging.",
  "",
  "### Route the request",
  "",
  "Ask in order:",
  "",
  "1. **Could this be a library paper?** Search the library first when the user names a title or bibkey.",
  "   If it is in `.prismnext/library/`, stop — use **Literature library** and `[@bibkey]`.",
  "2. **Discover IDs before prose.**",
  `   - Topic / catalog search → \`${TOOL_NAMES.literatureDiscover}\` (preferred).`,
  "   - websearch only when catalogs are insufficient — still stage before citing.",
  "3. **Stage every paper you will mention** — see `" +
    TOOL_NAMES.literatureStage +
    "` for layout and verification rules.",
  "4. **One reply after staging** — reuse `[n]` for the same paper; do not re-stage refs already in the session.",
  "",
  "### Soft workflow",
  "",
  `1. Discover DOI/arXiv via \`${TOOL_NAMES.literatureDiscover}\` (preferred) or websearch.`,
  `2. \`${TOOL_NAMES.literatureStage}\` each paper you will mention — see that tool for layout and verification.`,
  "3. Write your reply with `[n]` inline; the app may append a citations table.",
  "",
  "### Task handoff",
  "",
  "- Staging attaches to the parent chat session. If a Task result already lists session citations,",
  "  do not re-stage those refs.",
  "- End Task synthesis with `[n]` for every external paper you staged and relied on.",
  `- Delegation discipline (when not to Task-out) lives on the ${TOOL_NAMES.literatureStage} tool.`,
  "",
  "### Judgment",
  "",
  "- When staging cannot verify a paper, say what is missing or pick another source.",
  "- Prefer catalog discovery over websearch when the user wants citable academic metadata.",
  "- Short reading lists: stage only papers you actually discuss; do not stage a long dump you will not use.",
  "- When the user later asks to add a staged paper to the library, that is an explicit add — not part of staging.",
].join("\n");
