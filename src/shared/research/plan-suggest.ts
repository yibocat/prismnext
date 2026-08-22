/**
 * Plan-suggest consent helpers (HARD UI timing + accept payload).
 * Whether to suggest Plan is soft — the agent calls `suggest-plan`; no keyword heuristic.
 * UI countdown defaults to 15s; timeout ≡ dismiss (do not enter Plan).
 */

import {
  PLAN_DOC_STRUCTURE_HINTS,
  buildPlanDraftWriteBinding,
  sessionDraftPlanRel,
} from "./plan";

/** Cursor-style consent window — timeout means stay in Build. */
export const PLAN_SUGGEST_TIMEOUT_MS = 15_000;

/**
 * Tool result when the user accepts Enter Plan — must carry the draft path so the
 * *same turn* continuation writes the file (chat:send appendix already finished).
 */
export function buildPlanSuggestAcceptedResult(sessionId: string): {
  suggested: true;
  status: "accepted";
  planMode: true;
  draftPath: string;
  instruction: string;
} {
  const sid = sessionId.trim();
  const draftPath = sessionDraftPlanRel(sid);
  return {
    suggested: true,
    status: "accepted",
    planMode: true,
    draftPath,
    instruction: (
      `${buildPlanDraftWriteBinding(sid)} `
      + `Do this in this same turn before any long chat outline. `
      + `Structure: ${PLAN_DOC_STRUCTURE_HINTS}`
    ),
  };
}

export function clampPlanSuggestReason(reason: string | null | undefined, max = 160): string {
  const t = (reason ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Immediate gate before showing the consent strip (tool bridge). */
export type PlanSuggestGateStatus = "show" | "already_plan" | "dismissed" | "ignored";

export function resolvePlanSuggestGate(args: {
  sessionAgent?: string | null;
  dismissed?: boolean;
  tabId?: string | null;
}): PlanSuggestGateStatus {
  if (!args.tabId?.trim()) return "ignored";
  if (args.sessionAgent === "plan") return "already_plan";
  if (args.dismissed) return "dismissed";
  return "show";
}

/** User / timeout decision after the strip is shown. */
export type PlanSuggestDecision = "accepted" | "dismissed" | "timed_out";

