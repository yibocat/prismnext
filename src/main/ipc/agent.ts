/**
 * Product Agent IPC. The implementation is backed exclusively by Pi.
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
import { getAgentService } from "../agent/agent-service";

export function registerAgentHandlers(): void {
  ipcMain.handle("agent:status", async (event, args?: { projectRoot?: string }) => {
    const agent = await getAgentService();
    agent.attachOwner(event.sender);
    return agent.status(args?.projectRoot);
  });

  ipcMain.handle("agent:send", async (event, args: AgentSendInput) => {
    const agent = await getAgentService();
    agent.attachOwner(event.sender);
    const result = await agent.send({
      ...args,
      tabId: args.tabId,
    });
    return result;
  });

  ipcMain.handle("agent:cancel", async (_event, args: { conversationId: string }) => {
    const agent = await getAgentService();
    await agent.cancel(args.conversationId);
    return { ok: true };
  });

  ipcMain.handle("agent:cancelSubagent", async (_event, args: AgentCancelSubagentInput) => {
    const agent = await getAgentService();
    return { ok: agent.cancelSubagent(args.conversationId, args.toolCallId) };
  });

  ipcMain.handle("agent:dispose", async (_event, args?: { conversationId?: string }) => {
    const agent = await getAgentService();
    await agent.reset(args?.conversationId);
    return { ok: true };
  });

  ipcMain.handle(
    "agent:resolvePermission",
    async (_event, args: { requestId: string; decision: "allow" | "deny" }) => {
      const agent = await getAgentService();
      return { ok: agent.resolvePermission(args.requestId, args.decision) };
    },
  );

  ipcMain.handle("agent:listSessions", async (_event, args: { projectRoot: string }) => {
    const agent = await getAgentService();
    return agent.listSessions(args.projectRoot);
  });

  ipcMain.handle("agent:listSessionsByProjectId", async (_event, args: { projectId: string }) => {
    const agent = await getAgentService();
    return agent.listSessionsByProjectId(args.projectId);
  });

  ipcMain.handle("agent:loadSession", async (_event, args: AgentLoadSessionInput) => {
    const agent = await getAgentService();
    return agent.loadSession(args);
  });

  ipcMain.handle("agent:renameSession", async (_event, args: AgentRenameSessionInput) => {
    const agent = await getAgentService();
    return agent.renameSession(args);
  });

  ipcMain.handle("agent:generateSessionTitle", async (_event, args: AgentGenerateSessionTitleInput) => {
    const agent = await getAgentService();
    return agent.generateSessionTitle(args);
  });

  ipcMain.handle("agent:reassignSessionProject", async (_event, args: AgentReassignSessionProjectInput) => {
    const agent = await getAgentService();
    return agent.reassignSessionProject(args);
  });

  ipcMain.handle("agent:deleteSession", async (_event, args: AgentDeleteSessionInput) => {
    const agent = await getAgentService();
    return agent.deleteSession(args);
  });

  ipcMain.handle("agent:answerQuestion", async (_event, args: AgentAnswerQuestionInput) => {
    const agent = await getAgentService();
    return { ok: agent.answerQuestion(args) };
  });

  ipcMain.handle("agent:resolvePlanSuggest", async (_event, args: AgentResolvePlanSuggestInput) => {
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
    const agent = await getAgentService();
    return agent.compact(args);
  });

  ipcMain.handle("agent:describeImages", async (_event, args: AgentDescribeImagesInput) => {
    const agent = await getAgentService();
    return agent.describeImages(args);
  });

  ipcMain.handle("agent:truncateToTurn", async (_event, args: AgentTruncateInput) => {
    const agent = await getAgentService();
    return agent.truncateToTurn(args);
  });

  ipcMain.handle("agent:undoTruncate", async (_event, args: AgentUndoTruncateInput) => {
    const agent = await getAgentService();
    return agent.undoTruncate(args);
  });

  ipcMain.handle("agent:reassignDirectory", async (_event, args: AgentReassignDirectoryInput) => {
    const agent = await getAgentService();
    return agent.reassignDirectory(args);
  });

  ipcMain.handle("agent:syncIntensiveReading", async (_event, args: AgentSyncIntensiveReadingInput) => {
    const agent = await getAgentService();
    return agent.syncIntensiveReading(args);
  });

  ipcMain.handle("agent:getPlanEvents", async (_event, args: { conversationId: string }) => {
    const agent = await getAgentService();
    return agent.getPlanEvents(args.conversationId);
  });

  ipcMain.handle("agent:upsertPlanArtifact", async (_event, args: AgentPlanArtifactInput) => {
    const agent = await getAgentService();
    return agent.upsertPlanArtifact(args);
  });

  ipcMain.handle("agent:appendPlanDecision", async (_event, args: AgentPlanDecisionInput) => {
    const agent = await getAgentService();
    return agent.appendPlanDecision(args);
  });

  ipcMain.handle("agent:markPlanArtifactDiscarded", async (_event, args: { conversationId: string }) => {
    const agent = await getAgentService();
    return agent.markPlanArtifactDiscarded(args.conversationId);
  });

  ipcMain.handle("agent:upsertTurnMeta", async (_event, args: AgentTurnMetaInput) => {
    const agent = await getAgentService();
    return agent.upsertTurnMeta(args);
  });
}
