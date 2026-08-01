import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * External chat citations — soft workflow for papers not yet in the library.
 * Staging rules and verified:false handling live on literature-stage tool description.
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations (external papers)",
  "",
  "For papers **outside** the project library: discover identifiers → stage → cite as **`[n]`** in your reply.",
  "For library papers, use the **Literature library** module and **`[@bibkey]`** instead.",
  "",
  "### When this applies",
  "",
  "- Recommendations, recent literature, or any external source you will cite in chat.",
  "- After literature-discover or websearch — stage before writing the reply, not after.",
  "",
  "### Soft workflow",
  "",
  `1. Discover DOI/arXiv via \`${TOOL_NAMES.literatureDiscover}\` (preferred) or websearch.`,
  `2. \`${TOOL_NAMES.literatureStage}\` each paper you will mention — see that tool for layout and verification.`,
  "3. Write your reply with `[n]` inline; reuse the same number for the same paper.",
  "",
  "### Task handoff",
  "",
  "- Staging attaches to the parent chat session. If a Task result already lists session citations, do not re-stage those refs.",
  "- End Task synthesis with `[n]` for papers you staged; the app may append a citations table.",
].join("\n");
