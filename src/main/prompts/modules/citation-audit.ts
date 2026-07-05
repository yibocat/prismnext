import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Manuscript citation / bibliography compliance — behavioral rules only.
 *
 * Scope: .tex ↔ .bib ↔ literature library alignment via structured audit tools.
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
  `- Call \`${TOOL_NAMES.latexBibCheck}\` and \`${TOOL_NAMES.literatureCiteCheck}\` **in this conversation** — never wrap them in Task or a sub-agent.`,
  `- Call \`${TOOL_NAMES.latexBibCheck}\` **before** you report .tex ↔ .bib alignment (includes library.db by default).`,
  `- Call \`${TOOL_NAMES.literatureCiteCheck}\` **before** you report .tex keys vs library.db or bibFallback import options.`,
  "- When the user names an audit tool or asks to check citations/bibliography, invoke that tool **directly** — do **not** delegate.",
  "- Base your audit on **structured JSON from both tools** — do **not** substitute read/glob/grep on `.tex` or `.bib`.",
  "- Do **not** write the compliance report until both audit tools for this turn have returned.",
  "- Do **not** delegate citation/bibliography **compliance scanning** via Task — run the audit tools in this conversation.",
  "",
  "### Tool roles",
  "",
  `- \`${TOOL_NAMES.latexBibCheck}\`: manuscript .tex ↔ project .bib (+ library when includeLibraryCheck is true).`,
  `- \`${TOOL_NAMES.literatureCiteCheck}\`: every \\cite key in project .tex vs library.db bibkeys; bibFallback from manuscript .bib.`,
  `- \`${TOOL_NAMES.literatureExportBib}\` / \`${TOOL_NAMES.literatureCite}\`: sync library → .bib after audit — only when proposing explicit fixes or the user asks.`,
  "",
  "### Session context",
  "",
  "When **Session citation audit (this chat)** appears below, reuse that snapshot — do **not** re-run audit tools unless",
  "the user edited `.tex`/`.bib` since then or explicitly asks for a fresh check.",
  "",
  "### Task expert handoff (citation audit)",
  "",
  `- \`${TOOL_NAMES.latexBibCheck}\` / \`${TOOL_NAMES.literatureCiteCheck}\` record to the **parent chat session**, not the Task sub-agent session id.`,
  "- If the Task prompt includes **Session citation audit (this chat)**, synthesize from that table — do not assume the audit failed.",
  "- When delegating `@citation-auditor` for prose/style review after a compliance scan, cite the audit snapshot; the expert should not re-scan with read/glob.",
].join("\n");
