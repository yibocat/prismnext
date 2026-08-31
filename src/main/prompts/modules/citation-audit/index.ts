/** Citation & bibliography audit
 * Segment: module
 * Answers: when to check manuscript cite keys vs .bib vs library
 * Not here: tool how-to (citation-health)
 * Settings: bundled with agent (not user-replaceable)
 */
import type { PromptModule } from "../../types";
import { TOOL_NAMES } from "../../../../shared/agent/tool-names";
import { CITATION_AUDIT_PROMPT } from "./prompt";

export { CITATION_AUDIT_PROMPT };

export const CITATION_AUDIT_MODULE: PromptModule = {
  key: "citation-audit",
  label: "Citation & Bibliography Audit",
  description:
    `Manuscript LaTeX/Typst ↔ .bib ↔ library integrity via ${TOOL_NAMES.citationHealth} — not read/glob scans.`,
  enabled: true,
  profileOnly: true,
  source: "app",
  prompt: CITATION_AUDIT_PROMPT,
};
