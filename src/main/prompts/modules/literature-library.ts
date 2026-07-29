import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Project library papers — soft workflow for discovery and citing.
 * Tool parameters and gates live on literature-* tool descriptions.
 */
export const LITERATURE_LIBRARY_PROMPT = [
  "## Project literature library",
  "",
  "Papers **in** `.prismnext/library/` — search, read, cite as **`[@bibkey]`**.",
  "External papers (`[n]`) belong to the **Chat paper citations** module.",
  "",
  "### When this applies",
  "",
  "- User asks about papers already in the project library, tags, collections, or manuscript bibliography.",
  "",
  "### Soft workflow",
  "",
  `- Discover: \`${TOOL_NAMES.literatureSearch}\` → \`${TOOL_NAMES.literatureRead}\` for metadata.`,
  `- Need PDF body: \`${TOOL_NAMES.literatureIntensiveReading}\` then \`${TOOL_NAMES.literatureReadPdf}\` (see those tools).`,
  "- Cite inline as **`[@bibkey]`** with exact keys from tool results.",
  "- Manuscript `.bib` syncs from the library via `literature-export-bib`; citation integrity via `citation-health`.",
  "",
  "### Task handoff",
  "",
  "- Library Tasks accumulate hits on the parent session. End with a synthesis citing **`[@bibkey]`** for papers you relied on.",
  "- Read **Library papers (this Task)** in the result before re-searching.",
  "",
  "### Judgment",
  "",
  "- Entries may include user tags and AI summaries — prefer tag-aware search when the user organized by topic.",
  "- Collections are managed in the Literature panel; filter/add via tool params when relevant.",
  "- Project rules may specify export or citation style — defer to them.",
].join("\n");
