import {
  planDraftMissingRedirectNote,
  sessionDraftPlanRel,
} from "../../../shared/research-plan";

export { planDraftMissingRedirectNote };

/**
 * Plan-mode turn appendix: path-only binding (structure hints live on accept/kick).
 * todowrite is intentionally NOT required here — only after Approve & Execute.
 */
export function buildPlanModeTurnAppendix(sessionId?: string | null): string {
  const sid = sessionId?.trim();
  if (!sid) {
    // Must not emit a placeholder SESSION_ID — that trains the model to invent filenames.
    return [
      "---",
      "**Plan mode:** session is not bound yet — do not write a plan draft file this turn.",
      "---",
    ].join("\n");
  }

  const draftPath = sessionDraftPlanRel(sid);
  return [
    "---",
    "**Plan mode:**",
    `- Plan of record is only \`${draftPath}\` — write/edit that file; chat text is not the plan.`,
    "- Do not invent another drafts/ filename. Do not use Task/Expert subagents in Plan mode.",
    "- User confirms via Approve & Build on the file.",
    "---",
  ].join("\n");
}
