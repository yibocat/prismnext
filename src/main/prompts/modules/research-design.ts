import { TOOL_NAMES } from "../../../shared/tool-names";

/**
 * Research design — soft workflow around `.prismnext/research/brief.md`.
 * Section schema and tool args live in shared/research-brief.ts and brief tools.
 */
export const RESEARCH_DESIGN_PROMPT = [
  "## Research design",
  "",
  "Applies when the user explores research questions, hypotheses, contribution, scope, or readiness before writing and experiments.",
  "",
  "### Soft workflow",
  "",
  `1. \`${TOOL_NAMES.researchBriefRead}\` first — ground the conversation in the on-disk brief, not chat memory alone.`,
  "2. Collaborate to fill gaps when sections are empty or placeholder-only.",
  `3. After the user confirms changes, \`${TOOL_NAMES.researchBriefUpdate}\` for changed sections — one section per call (see tool for names).`,
  "",
  "### Judgment",
  "",
  `- Multi-step design (hypotheses, factors, protocol) → consider \`${TOOL_NAMES.suggestPlan}\` before a long chat dump.`,
  "- Delegate diagnosis to `research-design-coach` with a brief snapshot; you apply brief updates after synthesis.",
  "- While the design is still open, stay here. Once frozen in the brief, experiment execution moves to the **Experiments** module.",
  "- If a run surfaces a design flaw, update the brief before more runs.",
  "- Project rules may define section priorities or review gates — defer to them.",
].join("\n");
