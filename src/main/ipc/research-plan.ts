import { ipcMain } from "electron";
import {
  claimDraftForSession,
  discardDraftPlan,
  promoteDraftPlan,
  readDraftPlan,
  sessionHasPendingPlanDraft,
  writeResearchPlan,
} from "../services/research-plan-service";
import type { ResearchPlanDoc } from "../../shared/research/plan";

export function registerResearchPlanHandlers(): void {
  ipcMain.handle(
    "researchPlan:write",
    async (_event, args: { projectRoot: string; doc: ResearchPlanDoc }) => {
      try {
        return writeResearchPlan(args.projectRoot, args.doc);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false as const, error: message };
      }
    },
  );

  ipcMain.handle(
    "researchPlan:readDraft",
    async (_event, args: { projectRoot: string; sessionId?: string }) => {
      return readDraftPlan(args.projectRoot, args.sessionId);
    },
  );

  ipcMain.handle(
    "researchPlan:claimDraft",
    async (_event, args: { projectRoot: string; sessionId: string }) => {
      return claimDraftForSession(args.projectRoot, args.sessionId);
    },
  );

  ipcMain.handle(
    "researchPlan:hasPendingDraft",
    async (_event, args: { projectRoot: string; sessionId: string }) => {
      return {
        ok: true as const,
        pending: sessionHasPendingPlanDraft(args.projectRoot, args.sessionId),
      };
    },
  );

  ipcMain.handle(
    "researchPlan:promoteDraft",
    async (
      _event,
      args: {
        projectRoot: string;
        sessionId?: string;
        /** @deprecated Ignored — promote always renames to approved. */
        status?: "approved" | "snapshot";
      },
    ) => {
      return promoteDraftPlan(args.projectRoot, {
        sessionId: args.sessionId,
      });
    },
  );

  ipcMain.handle(
    "researchPlan:discardDraft",
    async (_event, args: { projectRoot: string; sessionId?: string }) => {
      return discardDraftPlan(args.projectRoot, args.sessionId);
    },
  );
}
