import { ipcMain } from "electron";
import {
  claimDraftForSession,
  discardDraftPlan,
  promoteDraftPlan,
  readDraftPlan,
  sessionHasPendingPlanDraft,
  writeResearchPlan,
} from "../research/research-plan-service";
import type { ResearchPlanDoc } from "../../shared/research/plan";
import { getRemoteSessionBroker } from "./remote";
import { routeHostDomainMethod } from "../remote/domain-route";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  return routeHostDomainMethod(method, args, {
    keys: ["projectRoot"],
    broker: getRemoteSessionBroker(),
    disconnected(name) {
      if (name === "researchPlan:readDraft") {
        return { hit: true, result: { ok: false, error: "not_connected" } };
      }
      if (name === "researchPlan:claimDraft") {
        return { hit: true, result: { ok: false, error: "not_connected" } };
      }
      if (name === "researchPlan:hasPendingDraft") {
        return { hit: true, result: { ok: true, pending: false } };
      }
      if (name === "researchPlan:write" || name === "researchPlan:promoteDraft" || name === "researchPlan:discardDraft") {
        return { hit: true, result: { ok: false, error: "not_connected" } };
      }
      return { hit: false };
    },
  });
}

export function registerResearchPlanHandlers(): void {
  ipcMain.handle(
    "researchPlan:write",
    async (_event, args: { projectRoot: string; doc: ResearchPlanDoc }) => {
      const remote = await routeIfRemote("researchPlan:write", args);
      if (remote !== undefined) return remote;
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
      const remote = await routeIfRemote("researchPlan:readDraft", args);
      if (remote !== undefined) return remote;
      return readDraftPlan(args.projectRoot, args.sessionId);
    },
  );

  ipcMain.handle(
    "researchPlan:claimDraft",
    async (_event, args: { projectRoot: string; sessionId: string }) => {
      const remote = await routeIfRemote("researchPlan:claimDraft", args);
      if (remote !== undefined) return remote;
      return claimDraftForSession(args.projectRoot, args.sessionId);
    },
  );

  ipcMain.handle(
    "researchPlan:hasPendingDraft",
    async (_event, args: { projectRoot: string; sessionId: string }) => {
      const remote = await routeIfRemote("researchPlan:hasPendingDraft", args);
      if (remote !== undefined) return remote;
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
      const remote = await routeIfRemote("researchPlan:promoteDraft", args);
      if (remote !== undefined) return remote;
      return promoteDraftPlan(args.projectRoot, {
        sessionId: args.sessionId,
      });
    },
  );

  ipcMain.handle(
    "researchPlan:discardDraft",
    async (_event, args: { projectRoot: string; sessionId?: string }) => {
      const remote = await routeIfRemote("researchPlan:discardDraft", args);
      if (remote !== undefined) return remote;
      return discardDraftPlan(args.projectRoot, args.sessionId);
    },
  );
}
