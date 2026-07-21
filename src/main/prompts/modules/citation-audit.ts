import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Citation audit — when to call citation-health; how-to lives on that tool.
 */
export const CITATION_AUDIT_PROMPT = [
  "## Citation & bibliography audit",
  "",
  "When checking manuscript citation compliance (.tex ↔ .bib ↔ library), call `" +
    TOOL_NAMES.citationHealth +
    "` **in this conversation** (see that tool — do not Task/subagent it, do not substitute read/glob/grep).",
  "",
  "### When this applies",
  "",
  "- User asks to check citations, bibliography, missing keys, unused keys, or fabrication risk.",
  "- Before writing a compliance report for this turn.",
  "",
  "### Session snapshot",
  "",
  "If **Session citation audit (this chat)** appears below, reuse it unless `.tex`/`.bib` changed or the user wants a fresh check.",
  "",
  "### After audit",
  "",
  `- Propose fixes with \`${TOOL_NAMES.literatureExportBib}\` only when recommending explicit syncs or the user asks.`,
  "- Optional prose review of citations: delegate to `peer-reviewer` with the audit snapshot (instruct it not to re-scan).",
].join("\n");
