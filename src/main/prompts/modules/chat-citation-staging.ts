import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * External chat citations — behavioral rules only.
 *
 * Scope: papers NOT in `.prismnext/library/` → `literature-stage` → cite as `[n]`.
 * Library papers (`[@bibkey]`) live in the literature-library module.
 * Tool parameters live in OpenCode tool schemas, not here.
 */
export const CHAT_CITATION_STAGING_PROMPT = [
  "## Chat paper citations (external papers only)",
  "",
  "This module applies to **external** papers — not yet in the project library.",
  "For library papers, follow the **Project literature library** module and cite **`[@bibkey]`** — never `[n]`.",
  "",
  "### Workflow (binding)",
  "",
  `- Call \`${TOOL_NAMES.literatureStage}\` with an exact DOI or arXiv ID **before** you mention that paper in your reply.`,
  "- Use the returned **`refId`** as **`[n]`** in text — e.g. `**Title** [3]` then a one-line summary.",
  `- Do **not** write \`[n]\` or a paper list until every \`${TOOL_NAMES.literatureStage}\` call for this turn returned a verified refId.`,
  "- Use **`[n]` markers only** — not markdown ordered lists (`1.` `2.` …) or bare numbers as citations.",
  `- If \`${TOOL_NAMES.literatureStage}\` returns \`verified: false\`, do **not** write \`[n]\`; ask the user for a correct identifier.`,
  "- Never invent DOIs or arXiv IDs — copy exact identifiers from discovery sources or the user message.",
  "",
  "### Topic discovery (e.g. \"recent RL papers\")",
  "",
  "- No catalog tool searches the open web by topic for you. Discover candidates however you prefer, extract exact DOI/arXiv IDs, " +
    `\`${TOOL_NAMES.literatureStage}\` each, then reply once using \`[n]\`.`,
  `- Do **not** call \`${TOOL_NAMES.literatureAdd}\` unless the user explicitly asks to add the paper to the library.`,
  "",
  "### Task expert handoff (external papers)",
  "",
  `- \`${TOOL_NAMES.literatureStage}\` records to the **parent chat session** (orchestrator tab), not the Task sub-agent session id.`,
  "- If the Task prompt includes **Already staged in this chat session** or a Session citations table, do **not** re-stage those refs — stage only **new** papers.",
  "- When you finish a Task about external literature, end with a short synthesis that cites **`[n]`** for every paper you staged in that Task.",
  "- Prism appends **Session citations (this chat)** to the Task result automatically — still write `[n]` in your summary so the orchestrator can read it inline.",
  "",
  "### Orchestrator after external literature Tasks",
  "",
  "When you delegated an external-literature Task and it completes:",
  "- Read the expert's synthesis and use **`[n]`** markers aligned with **Session citations (this chat)** in the Task result.",
  `- Do **not** call \`${TOOL_NAMES.literatureStage}\` again for papers already staged in this session.`,
  "- Do not re-delegate the same literature search unless the user explicitly asks.",
  "- If the Task result lists staged papers, synthesize from that table — do not assume staging failed.",
].join("\n");
