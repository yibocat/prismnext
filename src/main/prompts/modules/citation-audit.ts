import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Manuscript citation / bibliography compliance — behavioral rules only.
 *
 * Scope: .tex ↔ .bib ↔ literature library alignment via ONE structured audit tool.
 * Tool parameters live in OpenCode tool schemas, not here.
 */
export const CITATION_AUDIT_PROMPT = [
  "## Citation & bibliography audit (binding)",
  "",
  "This module applies when checking manuscript **citation compliance**:",
  "\\cite keys in `.tex`, project `.bib` entries, and papers in the literature library.",
  "",
  "### Workflow (binding)",
  "",
  `- Call \`${TOOL_NAMES.citationHealth}\` **in this conversation** — never wrap it in Task or a sub-agent.`,
  `- Call \`${TOOL_NAMES.citationHealth}\` **before** you report citation/bibliography compliance. One call returns the full .tex ↔ .bib ↔ library.db picture.`,
  "- When the user names an audit tool or asks to check citations/bibliography, invoke that tool **directly** — do **not** delegate.",
  "- Base your audit on **structured JSON from the tool** — do **not** substitute read/glob/grep on `.tex` or `.bib`.",
  "- Do **not** write the compliance report until the audit tool has returned for this turn.",
  "- Do **not** delegate citation/bibliography **compliance scanning** via Task — run the audit tool in this conversation.",
  "",
  "### Tool roles",
  "",
  `- \`${TOOL_NAMES.citationHealth}\`: unified audit — \\cite keys in .tex vs project .bib vs library.db; returns missingKeys, unusedKeys, duplicateKeys, bibFallback (importable from .bib), and bibKeysNotInLibrary. With verify=true (default), each bibFallback entry has verified=true/false — true means DOI/arXiv resolved in catalogs (traceable), false means unverifiable/fabricated. Report unverified entries as suspected fabrication; do NOT recommend importing them unless the user confirms the identifier.`,
  `- \`${TOOL_NAMES.literatureExportBib}\`: sync library → .bib after audit — only when proposing explicit fixes or the user asks.`,
  "",
  "### Session context",
  "",
  "When **Session citation audit (this chat)** appears below, reuse that snapshot — do **not** re-run the audit tool unless",
  "the user edited `.tex`/`.bib` since then or explicitly asks for a fresh check.",
  "",
  "### Task expert handoff (citation audit)",
  "",
  `- \`${TOOL_NAMES.citationHealth}\` records to the **parent chat session**, not the Task sub-agent session id.`,
  "- If the Task prompt includes **Session citation audit (this chat)**, synthesize from that table — do not assume the audit failed.",
  "- If you delegate prose/style review of the citations after an audit, delegate to `peer-reviewer` with the audit snapshot — instruct it not to re-scan with read/glob.",
].join("\n");
