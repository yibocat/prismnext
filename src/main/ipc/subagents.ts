import { ipcMain } from "electron";
import {
  deleteCustomSubagent,
  deleteCustomOrchestrator,
  getSubagentDetail,
  getOrchestratorDetail,
  listSubagents,
  listOrchestrators,
  saveCustomSubagent,
  saveCustomOrchestrator,
} from "../services/subagents-sync";
import { listSubagentRosterReferrers } from "../teams/lifecycle";
import { scheduleSubagentsRefresh } from "../services/project-subagents-refresh";
import type {
  SubagentInfo,
  OrchestratorInfo,
  SaveCustomSubagentPayload,
  SaveCustomOrchestratorPayload,
} from "../../shared/agent/subagents";

export function registerExpertsHandlers(): void {
  ipcMain.handle("subagents:list", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as SubagentInfo[];
    return listSubagents(args.projectPath);
  });

  ipcMain.handle("orchestrators:list", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as OrchestratorInfo[];
    return listOrchestrators(args.projectPath);
  });

  ipcMain.handle(
    "subagents:getDetail",
    async (_event, args: { projectPath: string; expertId: string }) => {
      if (!args.projectPath) return null;
      return getSubagentDetail(args.projectPath, args.expertId);
    },
  );

  ipcMain.handle(
    "subagents:saveCustom",
    async (_event, args: { projectPath: string; payload: SaveCustomSubagentPayload; targetTeamId?: string }) => {
      const expert = saveCustomSubagent(args.projectPath, args.payload, args.targetTeamId);
      scheduleSubagentsRefresh(args.projectPath);
      return { expert, experts: listSubagents(args.projectPath) };
    },
  );

  ipcMain.handle(
    "subagents:listRosterReferrers",
    async (_event, args: { projectPath: string; expertId: string }) => {
      if (!args.projectPath || !args.expertId) return [];
      return listSubagentRosterReferrers(args.projectPath, args.expertId);
    },
  );

  ipcMain.handle(
    "subagents:deleteCustom",
    async (_event, args: { projectPath: string; expertId: string }) => {
      deleteCustomSubagent(args.projectPath, args.expertId);
      scheduleSubagentsRefresh(args.projectPath);
      return { experts: listSubagents(args.projectPath) };
    },
  );

  ipcMain.handle(
    "orchestrators:getDetail",
    async (_event, args: { projectPath: string; orchestratorId: string }) => {
      if (!args.projectPath) return null;
      return getOrchestratorDetail(args.projectPath, args.orchestratorId);
    },
  );

  ipcMain.handle(
    "orchestrators:saveCustom",
    async (_event, args: { projectPath: string; payload: SaveCustomOrchestratorPayload; targetTeamId?: string }) => {
      const orchestrator = saveCustomOrchestrator(args.projectPath, args.payload, args.targetTeamId);
      scheduleSubagentsRefresh(args.projectPath);
      return { orchestrator, orchestrators: listOrchestrators(args.projectPath) };
    },
  );

  ipcMain.handle(
    "orchestrators:deleteCustom",
    async (_event, args: { projectPath: string; orchestratorId: string }) => {
      deleteCustomOrchestrator(args.projectPath, args.orchestratorId);
      scheduleSubagentsRefresh(args.projectPath);
      return { orchestrators: listOrchestrators(args.projectPath) };
    },
  );
}
