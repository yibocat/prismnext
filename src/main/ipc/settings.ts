import { ipcMain } from "electron";
import { getSettings, updateSettings } from "../services/settings";
import { APP_SYSTEM_PROMPT } from "../cli/app-shell";

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", async () => {
    return getSettings();
  });

  ipcMain.handle(
    "settings:set",
    async (_event, patch: Record<string, unknown>) => {
      updateSettings(patch as Parameters<typeof updateSettings>[0]);
    },
  );

  // ─── Agent Default Prompt ───

  ipcMain.handle("settings:getDefaultAgentPrompt", async () => {
    return APP_SYSTEM_PROMPT;
  });

  // ─── Agent Project Config ───

  ipcMain.handle(
    "settings:getAgentProjectConfig",
    async (_event, args: { projectPath: string }) => {
      const { readFileSync, existsSync } = require("node:fs");
      const { join } = require("node:path");
      const settingsPath = join(args.projectPath, ".prismnext", "settings.json");
      if (!existsSync(settingsPath)) return { contextComponents: {} };
      try {
        const raw = readFileSync(settingsPath, "utf-8");
        const data = JSON.parse(raw);
        return data.agent || { contextComponents: {} };
      } catch {
        return { contextComponents: {} };
      }
    },
  );

  ipcMain.handle(
    "settings:setAgentProjectConfig",
    async (_event, args: { projectPath: string; config: any }) => {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const { join } = require("node:path");
      const prismDir = join(args.projectPath, ".prismnext");
      const settingsPath = join(prismDir, "settings.json");
      if (!existsSync(prismDir)) mkdirSync(prismDir, { recursive: true });
      let data: any = {};
      if (existsSync(settingsPath)) {
        try {
          data = JSON.parse(readFileSync(settingsPath, "utf-8"));
        } catch {
          // Corrupted settings — start fresh
        }
      }
      data.agent = args.config;
      writeFileSync(settingsPath, JSON.stringify(data, null, 2), "utf-8");
    },
  );
}
