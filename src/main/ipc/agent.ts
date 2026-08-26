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
  stripAgentSecrets,
} from "../../shared/remote";
import { getAgentService } from "../agent/agent-service";
import { stageLaptopAttachmentsForRemote } from "../remote/agent-attachments";
import {
  disconnectedRemoteAgentStatus,
  isDesktopOnlyAgentMethod,
  rememberRemoteConversation,
  remoteProfileIdFromAgentArgs,
  rewriteAgentParamsForHost,
} from "../remote/agent-route";
import { getRemoteSessionBroker } from "./remote";

async function routeIfRemote(method: string, args: unknown): Promise<unknown | undefined> {
  if (isDesktopOnlyAgentMethod(method)) return undefined;
  const broker = getRemoteSessionBroker();
  const profileId = remoteProfileIdFromAgentArgs(args, (projectId) => broker.profileIdForProjectId(projectId));
  if (!profileId) return undefined;
  if (!broker.isBound(profileId)) {
    if (method === "agent:status") {
      const rec = args && typeof args === "object" && !Array.isArray(args)
        ? args as { projectRoot?: string }
        : {};
      return disconnectedRemoteAgentStatus(typeof rec.projectRoot === "string" ? rec.projectRoot : null);
    }
    if (method === "agent:listSessions" || method === "agent:listSessionsByProjectId") {
      return [];
    }
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
    const remote = await routeIfRemote("agent:send", args);
    if (remote !== undefined) return remote;
    const agent = await getAgentService();
    agent.attachOwner(event.sender);
    const result = await agent.send({
      ...args,
      tabId: args.tabId,
    });
    return result;
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

  ipcMain.handle("agent:listSessionsByProjectId", async (_event, args: { projectId: string }) => {
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
