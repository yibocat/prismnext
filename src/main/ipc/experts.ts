import { ipcMain } from "electron";
import {
  deleteCustomExpert,
  deleteCustomOrchestrator,
  getExpertDetail,
  getOrchestratorDetail,
  listExperts,
  listOrchestrators,
  saveCustomExpert,
  saveCustomOrchestrator,
} from "../services/experts-sync";
import { scheduleExpertsRefresh } from "../services/project-experts-refresh";
import type {
  ExpertInfo,
  OrchestratorInfo,
  SaveCustomExpertPayload,
  SaveCustomOrchestratorPayload,
} from "../services/agent-experts";

export function registerExpertsHandlers(): void {
  ipcMain.handle("experts:list", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as ExpertInfo[];
    return listExperts(args.projectPath);
  });

  ipcMain.handle("orchestrators:list", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as OrchestratorInfo[];
    return listOrchestrators(args.projectPath);
  });

  ipcMain.handle(
    "experts:getDetail",
    async (_event, args: { projectPath: string; expertId: string }) => {
      if (!args.projectPath) return null;
      return getExpertDetail(args.projectPath, args.expertId);
    },
  );

  ipcMain.handle(
    "experts:saveCustom",
    async (_event, args: { projectPath: string; payload: SaveCustomExpertPayload }) => {
      const expert = saveCustomExpert(args.projectPath, args.payload);
      scheduleExpertsRefresh(args.projectPath);
      return { expert, experts: listExperts(args.projectPath) };
    },
  );

  ipcMain.handle(
    "experts:deleteCustom",
    async (_event, args: { projectPath: string; expertId: string }) => {
      deleteCustomExpert(args.projectPath, args.expertId);
      scheduleExpertsRefresh(args.projectPath);
      return { experts: listExperts(args.projectPath) };
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
    async (_event, args: { projectPath: string; payload: SaveCustomOrchestratorPayload }) => {
      const orchestrator = saveCustomOrchestrator(args.projectPath, args.payload);
      scheduleExpertsRefresh(args.projectPath);
      return { orchestrator, orchestrators: listOrchestrators(args.projectPath) };
    },
  );

  ipcMain.handle(
    "orchestrators:deleteCustom",
    async (_event, args: { projectPath: string; orchestratorId: string }) => {
      deleteCustomOrchestrator(args.projectPath, args.orchestratorId);
      scheduleExpertsRefresh(args.projectPath);
      return { orchestrators: listOrchestrators(args.projectPath) };
    },
  );
}
