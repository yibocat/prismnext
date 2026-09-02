/**
 * Product Agent IPC. The implementation is backed exclusively by Pi.
 *
 * Remote focus (handle lastPath is remote://…): HOST_AGENT_METHODS go to
 * prismnext-host over SSH. DESKTOP_ONLY_AGENT_METHODS stay here (Gateway / keys).
 * Strip apiKey before any frame leaves this computer.
 */

import { ipcMain } from "electron";
import type {
  AgentAnswerQuestionInput,
  AgentCompactInput,
  AgentDeleteSessionInput,
  AgentDescribeImagesInput,
  AgentListModelsInput,
  AgentPlanArtifactInput,
  AgentPlanDecisionInput,
  AgentReassignDirectoryInput,
  AgentSyncIntensiveReadingInput,
  AgentTruncateInput,
  AgentTurnMetaInput,
  AgentUndoTruncateInput,
  AgentListSessionsByProjectIdArgs,
  AgentLoadSessionInput,
  AgentModelEffortInput,
  AgentRenameSessionInput,
  AgentGenerateSessionTitleInput,
  AgentReassignSessionProjectInput,
  AgentResolvePlanSuggestInput,
  AgentSendInput,
  AgentCancelSubagentInput,
  AgentTestConnectionInput,
} from "../../shared/agent/api";
import {
  agentInputHasLaptopAttachments,
  RemoteOperationError,
  stripAgentSecrets,
} from "../../shared/remote";
import { getAgentService } from "../agent/agent-service";
import { applyPromptFilesToUserText } from "../session/prompt-file-attachments";
import { stageLaptopAttachmentsForRemote } from "../remote/agent-attachments";
import {
  disconnectedRemoteAgentProbe,
  disconnectedRemoteAgentStatus,
  isDesktopOnlyAgentMethod,
  lookupRemoteProfileIdForProject,
  forgetRemoteConversation,
  rememberRemoteConversation,
  resolveRemoteAgentListTarget,
  rewriteAgentParamsForHost,
} from "../remote/agent-route";
import { resolveProjectLastPath } from "../workbench/default-project";
import { getRemoteSessionBroker } from "./remote";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  if (isDesktopOnlyAgentMethod(method)) return undefined;
  const broker = getRemoteSessionBroker();
  const target = resolveRemoteAgentListTarget(args, {
    isBound: (profileId) => broker.isBound(profileId),
    lookupProjectId: (projectId) => lookupRemoteProfileIdForProject(
      projectId,
      (id) => broker.profileIdForProjectId(id),
      (id) => resolveProjectLastPath(id),
    ),
  });
  if (target.kind === "local") {
    if (method === "agent:reassignSessionProject") {
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { conversationId?: string }
        : {};
      if (typeof rec.conversationId === "string") {
        forgetRemoteConversation(rec.conversationId);
      }
    }
    return undefined;
  }
  const profileId = target.profileId;
  if (!target.bound) {
    if (method === "agent:reassignSessionProject") {
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { conversationId?: string }
        : {};
      if (typeof rec.conversationId === "string") {
        rememberRemoteConversation(rec.conversationId, profileId);
      }
      return undefined;
    }
    if (method === "agent:status") {
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { projectRoot?: string }
        : {};
      return disconnectedRemoteAgentStatus(typeof rec.projectRoot === "string" ? rec.projectRoot : null);
    }
    if (method === "agent:listSessions" || method === "agent:listSessionsByProjectId") {
      const { listWorkbenchMembers } = await import("../workbench/default-project");
      const { listMirroredSessions } = await import("../remote/session-mirror");
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { projectRoot?: string; projectId?: string }
        : {};
      const members = listWorkbenchMembers();
      const projectId = rec.projectId
        || members.find((item) => item.lastPath === rec.projectRoot)?.id
        || "";
      if (projectId) {
        return listMirroredSessions(profileId, projectId).map((item) => ({
          conversationId: item.conversationId,
          title: item.title,
          updatedAt: Date.parse(item.updatedAt) || 0,
          createdAt: Date.parse(item.updatedAt) || 0,
          fromCache: true,
        }));
      }
      return [];
    }
    if (method === "agent:loadSession") {
      const { listWorkbenchMembers } = await import("../workbench/default-project");
      const { readMirroredSession } = await import("../remote/session-mirror");
      const { hydrateSessionRecordToConversation } = await import("../agent/session-hydrator");
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { conversationId?: string; projectRoot?: string; projectId?: string }
        : {};
      const members = listWorkbenchMembers();
      const projectId = rec.projectId
        || members.find((item) => item.lastPath === rec.projectRoot)?.id
        || "";
      const cached = projectId && rec.conversationId
        ? readMirroredSession(profileId, projectId, rec.conversationId)
        : null;
      if (cached) {
        return {
          ok: true,
          conversationId: rec.conversationId,
          title: typeof cached.title === "string" ? cached.title : "Chat",
          conversation: hydrateSessionRecordToConversation(cached as never),
          directory: typeof cached.boundCheckoutPath === "string" ? cached.boundCheckoutPath : undefined,
          planEvents: Array.isArray(cached.planEvents) ? cached.planEvents : [],
          fromCache: true,
        };
      }
      return { ok: false, error: "offline_session_missing", fromCache: true };
    }
    return disconnectedRemoteAgentProbe(method);
  }
  let payload: unknown = args ?? {};
  if (method === "agent:send" && agentInputHasLaptopAttachments(payload)) {
    const staged = await stageLaptopAttachmentsForRemote(payload, async (absPath, bytes) => {
      await broker.invoke(profileId, "fs:writeBlob", {
        path: absPath,
        bytes: bytes.toString("base64"),
        offset: 0,
      });
    });
    if (!staged.ok) return { ok: false, error: staged.error };
    payload = staged.input;
  }
  const safe = stripAgentSecrets(payload);
  const localized = rewriteAgentParamsForHost(safe);
  if (typeof localized.conversationId === "string") {
    rememberRemoteConversation(localized.conversationId, profileId);
  }
  if (typeof localized.tabId === "string") {
    rememberRemoteConversation(localized.tabId, profileId);
  }
  return broker.invoke(profileId, method, localized);
}

export function registerAgentHandlers(): void {
  ipcMain.handle("agent:status", async (event, args?: { projectRoot?: string }) => {
    const remote = await routeIfRemote("agent:status", args ?? {});
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    agent.attachOwner(event.sender);
    return agent.status(args?.projectRoot);
  });

  ipcMain.handle("agent:send", async (event, args: AgentSendInput) => {
    try {
      // Convert Office/PDF attachments on the laptop before local Pi or Host.
      // Remote Host must not receive file:// paths that only exist here.
      const applied = await applyPromptFilesToUserText(args.text, args.promptFiles);
      const sendArgs: AgentSendInput = {
        ...args,
        text: applied.text,
        promptFiles: undefined,
        tabId: args.tabId,
      };
      const remote = await routeIfRemote("agent:send", sendArgs);
      if (remote !== undefined) return remote;
      const agent = await getAgentService();
      agent.attachOwner(event.sender);
      return agent.send(sendArgs);
    } catch (err) {
      if (err instanceof RemoteOperationError) {
        return {
          ok: false,
          error: err.code === "not_connected" ? "host_control_plane_dropped" : err.message,
        };
      }
      throw err;
    }
  });

  ipcMain.handle("agent:cancel", async (_event, args: { conversationId: string }) => {
    const remote = await routeIfRemote("agent:cancel", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    await agent.cancel(args.conversationId);
    return { ok: true };
  });

  ipcMain.handle("agent:cancelSubagent", async (_event, args: AgentCancelSubagentInput) => {
    const remote = await routeIfRemote("agent:cancelSubagent", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return { ok: agent.cancelSubagent(args.conversationId, args.toolCallId) };
  });

  ipcMain.handle("agent:dispose", async (_event, args?: { conversationId?: string }) => {
    const remote = await routeIfRemote("agent:dispose", args ?? {});
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    await agent.reset(args?.conversationId);
    return { ok: true };
  });

  ipcMain.handle(
    "agent:resolvePermission",
    async (_event, args: { requestId: string; decision: "allow" | "deny" }) => {
      const remote = await routeIfRemote("agent:resolvePermission", args);
      if (remote !== undefined) return remote;
      const agent = await getAgentService();
      return { ok: agent.resolvePermission(args.requestId, args.decision) };
    },
  );

  ipcMain.handle("agent:listSessions", async (_event, args: { projectRoot: string }) => {
    const remote = await routeIfRemote("agent:listSessions", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.listSessions(args.projectRoot);
  });

  ipcMain.handle("agent:listSessionsByProjectId", async (_event, args: AgentListSessionsByProjectIdArgs) => {
    const remote = await routeIfRemote("agent:listSessionsByProjectId", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.listSessionsByProjectId(args.projectId);
  });

  ipcMain.handle("agent:loadSession", async (_event, args: AgentLoadSessionInput) => {
    const remote = await routeIfRemote("agent:loadSession", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.loadSession(args);
  });

  ipcMain.handle("agent:renameSession", async (_event, args: AgentRenameSessionInput) => {
    const remote = await routeIfRemote("agent:renameSession", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.renameSession(args);
  });

  ipcMain.handle("agent:generateSessionTitle", async (_event, args: AgentGenerateSessionTitleInput) => {
    const remote = await routeIfRemote("agent:generateSessionTitle", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.generateSessionTitle(args);
  });

  ipcMain.handle("agent:reassignSessionProject", async (_event, args: AgentReassignSessionProjectInput) => {
    const remote = await routeIfRemote("agent:reassignSessionProject", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.reassignSessionProject(args);
  });

  ipcMain.handle("agent:deleteSession", async (_event, args: AgentDeleteSessionInput) => {
    const remote = await routeIfRemote("agent:deleteSession", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.deleteSession(args);
  });

  ipcMain.handle("agent:answerQuestion", async (_event, args: AgentAnswerQuestionInput) => {
    const remote = await routeIfRemote("agent:answerQuestion", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return { ok: agent.answerQuestion(args) };
  });

  ipcMain.handle("agent:resolvePlanSuggest", async (_event, args: AgentResolvePlanSuggestInput) => {
    const remote = await routeIfRemote("agent:resolvePlanSuggest", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return { ok: agent.resolvePlanSuggest(args) };
  });

  ipcMain.handle("agent:listModels", async (_event, args: AgentListModelsInput) => {
    const agent = await getAgentService();
    return agent.listModels(args);
  });

  ipcMain.handle("agent:listModelsCatalog", async () => {
    const agent = await getAgentService();
    return agent.listModelsCatalog();
  });

  ipcMain.handle("agent:testConnection", async (_event, args: AgentTestConnectionInput) => {
    const agent = await getAgentService();
    return agent.testConnection(args);
  });

  ipcMain.handle("agent:getModelEffort", async (_event, args: AgentModelEffortInput) => {
    const agent = await getAgentService();
    return agent.getModelEffort(args);
  });

  ipcMain.handle("agent:getEffortCatalog", async () => {
    const agent = await getAgentService();
    return agent.getEffortCatalog();
  });

  ipcMain.handle("agent:compact", async (_event, args: AgentCompactInput) => {
    const remote = await routeIfRemote("agent:compact", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.compact(args);
  });

  ipcMain.handle("agent:describeImages", async (_event, args: AgentDescribeImagesInput) => {
    const agent = await getAgentService();
    return agent.describeImages(args);
  });

  ipcMain.handle("agent:truncateToTurn", async (_event, args: AgentTruncateInput) => {
    const remote = await routeIfRemote("agent:truncateToTurn", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.truncateToTurn(args);
  });

  ipcMain.handle("agent:undoTruncate", async (_event, args: AgentUndoTruncateInput) => {
    const remote = await routeIfRemote("agent:undoTruncate", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.undoTruncate(args);
  });

  ipcMain.handle("agent:reassignDirectory", async (_event, args: AgentReassignDirectoryInput) => {
    const remote = await routeIfRemote("agent:reassignDirectory", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.reassignDirectory(args);
  });

  ipcMain.handle("agent:syncIntensiveReading", async (_event, args: AgentSyncIntensiveReadingInput) => {
    const remote = await routeIfRemote("agent:syncIntensiveReading", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.syncIntensiveReading(args);
  });

  ipcMain.handle("agent:getPlanEvents", async (_event, args: { conversationId: string }) => {
    const remote = await routeIfRemote("agent:getPlanEvents", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.getPlanEvents(args.conversationId);
  });

  ipcMain.handle("agent:upsertPlanArtifact", async (_event, args: AgentPlanArtifactInput) => {
    const remote = await routeIfRemote("agent:upsertPlanArtifact", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.upsertPlanArtifact(args);
  });

  ipcMain.handle("agent:appendPlanDecision", async (_event, args: AgentPlanDecisionInput) => {
    const remote = await routeIfRemote("agent:appendPlanDecision", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.appendPlanDecision(args);
  });

  ipcMain.handle("agent:markPlanArtifactDiscarded", async (_event, args: { conversationId: string }) => {
    const remote = await routeIfRemote("agent:markPlanArtifactDiscarded", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.markPlanArtifactDiscarded(args.conversationId);
  });

  ipcMain.handle("agent:upsertTurnMeta", async (_event, args: AgentTurnMetaInput) => {
    const remote = await routeIfRemote("agent:upsertTurnMeta", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    return agent.upsertTurnMeta(args);
  });
}
