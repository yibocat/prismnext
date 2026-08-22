import { ipcMain } from "electron";
import {
  listProjectRules,
  installProjectRule,
  deleteProjectRule,
  setProjectRuleEnabled,
  type ProjectRuleInfo,
} from "../prompts/rules-sync";

export function registerRulesHandlers(): void {
  ipcMain.handle("agent:listRules", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as ProjectRuleInfo[];
    return listProjectRules(args.projectPath);
  });

  ipcMain.handle(
    "agent:installRule",
    async (
      _event,
      args: { projectPath: string; ruleId: string; content: string },
    ) => {
      installProjectRule(args.projectPath, args.ruleId, args.content);
    },
  );

  ipcMain.handle(
    "agent:deleteRule",
    async (_event, args: { projectPath: string; ruleId: string }) => {
      deleteProjectRule(args.projectPath, args.ruleId);
    },
  );

  ipcMain.handle(
    "agent:setRuleEnabled",
    async (
      _event,
      args: { projectPath: string; ruleId: string; enabled: boolean },
    ) => {
      setProjectRuleEnabled(args.projectPath, args.ruleId, args.enabled);
    },
  );
}
