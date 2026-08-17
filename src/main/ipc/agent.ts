/**
 * Product Agent IPC. The implementation is backed exclusively by Pi.
 */

import { ipcMain } from "electron";
import type {
  AgentLoadSessionInput,
  AgentRenameSessionInput,
  AgentSendInput,
} from "../../shared/agent-api";
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
    return agent.send({
      ...args,
      tabId: args.tabId,
    });
  });

  ipcMain.handle("agent:cancel", async (_event, args: { conversationId: string }) => {
    const agent = await getAgentService();
    await agent.cancel(args.conversationId);
    return { ok: true };
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

  ipcMain.handle("agent:loadSession", async (_event, args: AgentLoadSessionInput) => {
    const agent = await getAgentService();
    return agent.loadSession(args);
  });

  ipcMain.handle("agent:renameSession", async (_event, args: AgentRenameSessionInput) => {
    const agent = await getAgentService();
    return agent.renameSession(args);
  });
}
