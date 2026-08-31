import {
  claimDraftForSession,
  discardDraftPlan,
  promoteDraftPlan,
  readDraftPlan,
  sessionHasPendingPlanDraft,
  writeResearchPlan,
} from "../main/research/research-plan-service";
import type { ResearchPlanDoc } from "../shared/research/plan";
import type { HostHandlerContext } from "./context";

function rootOf(params: Record<string, unknown>, ctx: HostHandlerContext): string {
  return typeof params.projectRoot === "string" && params.projectRoot.trim()
    ? params.projectRoot
    : ctx.remoteRoot ?? "";
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const researchHandlers: Record<
  string,
  (params: Record<string, unknown>, ctx: HostHandlerContext) => Promise<unknown>
> = {
  async "researchPlan:write"(params, ctx) {
    try {
      return writeResearchPlan(rootOf(params, ctx), params.doc as ResearchPlanDoc);
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
  async "researchPlan:readDraft"(params, ctx) {
    return readDraftPlan(rootOf(params, ctx), asString(params.sessionId) || undefined);
  },
  async "researchPlan:claimDraft"(params, ctx) {
    return claimDraftForSession(rootOf(params, ctx), asString(params.sessionId));
  },
  async "researchPlan:hasPendingDraft"(params, ctx) {
    return {
      ok: true as const,
      pending: sessionHasPendingPlanDraft(rootOf(params, ctx), asString(params.sessionId)),
    };
  },
  async "researchPlan:promoteDraft"(params, ctx) {
    return promoteDraftPlan(rootOf(params, ctx), { sessionId: asString(params.sessionId) || undefined });
  },
  async "researchPlan:discardDraft"(params, ctx) {
    return discardDraftPlan(rootOf(params, ctx), asString(params.sessionId) || undefined);
  },
};
