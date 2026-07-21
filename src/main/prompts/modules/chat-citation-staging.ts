import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * External chat citations — when to enable staging; how-to lives on literature-stage tool.
 *
 * Scope: papers NOT in `.prismnext/library/` → literature-stage → `[n]`.
 * Library papers: literature-library module → `[@bibkey]`.
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations (external papers only)",
  "",
  "For papers **not** in the project library: discover identifiers → `" +
    TOOL_NAMES.literatureStage +
    "` → cite as **`[n]`**. See that tool for BINDING rules (MCP ≠ citation, layout, verified:false).",
  "For library papers, use the **Project literature library** module and **`[@bibkey]`** — never `[n]`.",
  "",
  "### When this applies",
  "",
  "- User asks for recent / external papers, recommendations, or anything you will cite that is not already in the library.",
  "- After Paper Search MCP (or websearch fallback), stage before writing the reply — do not list MCP titles as if they were session citations.",
  "",
  "### Reply shape (example)",
  "",
  "- One paper per line: `**Title** [3]` then a short summary. Reuse the same `[n]` for the same paper.",
  "",
  "### Task handoff (external papers)",
  "",
  `- Staging attaches to the **parent chat session**. If the Task prompt already lists session citations, do not re-stage those refs.`,
  "- End Task synthesis with `[n]` for papers you staged; prismnext may append a Session citations table — still write `[n]` inline.",
  "",
  "### Orchestrator after such Tasks",
  "",
  "- Align `[n]` with **Session citations (this chat)** in the Task result; do not re-stage already-staged papers.",
].join("\n");
