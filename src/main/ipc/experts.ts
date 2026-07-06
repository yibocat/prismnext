import { ipcMain } from "electron";
import {
  deleteCustomExpert,
  deleteCustomOrchestrator,
  getExpertDetail,
  getOrchestratorDetail,
  listExperts,
  listOrchestrators,
  readExpertsManifest,
  readOrchestratorsManifest,
  saveBuiltinExpertOverride,
  saveBuiltinOrchestratorOverride,
  saveCustomExpert,
  saveCustomOrchestrator,
  setBuiltinExpertEnabled,
  setDefaultOrchestrator,
  resetBuiltinExpertOverride,
  resetBuiltinOrchestratorOverride,
  resetAllBuiltinExpertsToDefaults,
  getExpertEditorOptions,
} from "../services/experts-sync";
import { scheduleExpertsRefresh } from "../services/project-experts-refresh";
import { DEFAULT_ORCHESTRATOR_ID } from "../services/agent-experts";
import type {
  ExpertInfo,
  ExpertsManifest,
  OrchestratorInfo,
  OrchestratorsManifest,
  SaveBuiltinExpertOverridePayload,
  SaveBuiltinOrchestratorOverridePayload,
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

  ipcMain.handle("experts:getManifest", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return { disabledBuiltinIds: [] } as ExpertsManifest;
    return readExpertsManifest(args.projectPath);
  });

  ipcMain.handle("orchestrators:getManifest", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) {
      return { defaultOrchestratorId: DEFAULT_ORCHESTRATOR_ID, disabledBuiltinIds: [] } as OrchestratorsManifest;
    }
    return readOrchestratorsManifest(args.projectPath);
  });

  ipcMain.handle(
    "experts:getDetail",
    async (_event, args: { projectPath: string; expertId: string }) => {
      if (!args.projectPath) return null;
      return getExpertDetail(args.projectPath, args.expertId);
    },
  );

  ipcMain.handle(
    "experts:setBuiltinEnabled",
    async (_event, args: { projectPath: string; expertId: string; enabled: boolean }) => {
      setBuiltinExpertEnabled(args.projectPath, args.expertId, args.enabled);
      scheduleExpertsRefresh(args.projectPath);
      return {
        manifest: readExpertsManifest(args.projectPath),
        experts: listExperts(args.projectPath),
      };
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
    "experts:saveBuiltinOverride",
    async (_event, args: { projectPath: string; payload: SaveBuiltinExpertOverridePayload }) => {
      const expert = saveBuiltinExpertOverride(args.projectPath, args.payload);
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
    "orchestrators:setDefault",
    async (_event, args: { projectPath: string; orchestratorId: string }) => {
      setDefaultOrchestrator(args.projectPath, args.orchestratorId);
      scheduleExpertsRefresh(args.projectPath);
      return {
        manifest: readOrchestratorsManifest(args.projectPath),
        orchestrators: listOrchestrators(args.projectPath),
      };
    },
  );

  ipcMain.handle(
    "orchestrators:saveBuiltinOverride",
    async (_event, args: { projectPath: string; payload: SaveBuiltinOrchestratorOverridePayload }) => {
      const orchestrator = saveBuiltinOrchestratorOverride(args.projectPath, args.payload);
      scheduleExpertsRefresh(args.projectPath);
      return { orchestrator, orchestrators: listOrchestrators(args.projectPath) };
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

  ipcMain.handle("experts:getEditorOptions", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) {
      return { skills: [], mcpServers: [], modules: [], commands: [], rules: [] };
    }
    return getExpertEditorOptions(args.projectPath);
  });

  ipcMain.handle(
    "experts:resetBuiltinOverride",
    async (_event, args: { projectPath: string; expertId: string }) => {
      const expert = resetBuiltinExpertOverride(args.projectPath, args.expertId);
      scheduleExpertsRefresh(args.projectPath);
      return { expert, experts: listExperts(args.projectPath) };
    },
  );

  ipcMain.handle("experts:resetBuiltinsToDefaults", async (_event, args: { projectPath: string }) => {
    const manifest = resetAllBuiltinExpertsToDefaults(args.projectPath);
    scheduleExpertsRefresh(args.projectPath);
    return { manifest, experts: listExperts(args.projectPath) };
  });

  ipcMain.handle(
    "orchestrators:resetBuiltinOverride",
    async (_event, args: { projectPath: string; orchestratorId: string }) => {
      const orchestrator = resetBuiltinOrchestratorOverride(args.projectPath, args.orchestratorId);
      scheduleExpertsRefresh(args.projectPath);
      return { orchestrator, orchestrators: listOrchestrators(args.projectPath) };
    },
  );
}
