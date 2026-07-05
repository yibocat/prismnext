import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Project library papers — behavioral rules only.
 *
 * Scope: papers IN `.prismnext/library/` → search/read → cite as `[@bibkey]`.
 * External papers (`[n]`) live in the chat-citation-staging module.
 * Tool parameters live in OpenCode tool schemas, not here.
 */
export const LITERATURE_LIBRARY_PROMPT = [
  "## Project literature library (library papers only)",
  "",
  "This module applies to papers **already in** the project library (`.prismnext/library/`).",
  `For **external** papers, follow the **Chat paper citations** module — \`${TOOL_NAMES.literatureStage}\` then **\`[n]\`**, never \`[@bibkey]\`.`,
  "",
  "### Discovery (binding)",
  "",
  "Entries may include **user tags** and an **AI summary** (Literature panel).",
  "When the user asks about a topic you tagged, prefer searching by that tag text — not abstract alone.",
  `- Use \`${TOOL_NAMES.literatureSearch}\` to find papers; \`${TOOL_NAMES.literatureRead}\` before summarizing one paper's metadata.`,
  `- Use \`${TOOL_NAMES.literatureReadPdf}\` for PDF body quotes **only** on papers in the chat **Intensive reading** list (when the per-turn intensive block is present).`,
  "",
  "### Citing in chat (binding)",
  "",
  "Cite library papers inline as **`[@bibkey]`** — exact bibkeys from tool results only, never invented keys.",
  "Examples: `Prior work [@smith2024] proposes …` · PDF quote: `… [@smith2024] (p. 4).`",
  `- Do **not** use \`${TOOL_NAMES.literatureStage}\` or numeric **[n]** for library papers.`,
  "",
  "### Manuscript bibliography (library-first)",
  "",
  "**Single source of truth:** `.prismnext/library/library.db`. Sync to manuscript `.bib` via `literature-cite` / `literature-export-bib`.",
  "- External papers: stage → add to library → export. If keys in .bib but not library, import to library first.",
  "",
  "### Task expert handoff (library papers)",
  "",
  `- \`${TOOL_NAMES.literatureSearch}\` and \`${TOOL_NAMES.literatureRead}\` in a Task accumulate library hits on the **parent chat session** (for Task result enrich).`,
  "When you finish a Task about the project library, end with a short synthesis that cites **`[@bibkey]`** for every paper you relied on.",
  "Prism appends **Library papers (this Task)** to the Task result automatically — still write `[@bibkey]` in your summary so the orchestrator can read it inline.",
  "",
  "### Orchestrator after library Tasks",
  "",
  "When you delegated a library-literature Task and it completes:",
  "- Read the expert's synthesis and cite **`[@bibkey]`** with exact keys from **Library papers (this Task)** in the Task result.",
  "- Do not re-delegate the same library search unless the user explicitly asks.",
  "- If the Task result lists papers, synthesize from it — do not assume the search failed.",
].join("\n");
