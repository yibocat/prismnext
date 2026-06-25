// prism-next/src/main/ipc/commands.ts
import { writeFileSync, readFileSync } from "node:fs";
import { ipcMain } from "electron";
import { CommandEngine } from "../commands";
import { commandRegistry } from "../commands/registry";
import { getSettings, updateSettings } from "../services/settings";
import type {
  CreateCommandPayload,
  UpdateCommandPayload,
} from "../commands/types";
import type { CommandImportConflictStrategy } from "../commands/export-import";

const engine = CommandEngine.getInstance();

function ensureProjectRoot(projectRoot: string): void {
  if (!projectRoot) throw new Error("No project root");
  commandRegistry.setProjectRoot(projectRoot);
}

export function registerCommandsHandlers(): void {
  // ── Query ──

  ipcMain.handle(
    "commands:list",
    async (_event, args?: { projectRoot?: string | null }) => {
      if (args?.projectRoot) {
        commandRegistry.setProjectRoot(args.projectRoot);
      }
      return engine.list();
    },
  );

  ipcMain.handle(
    "commands:expand",
    async (
      _event,
      args: { name: string; rawInput: string; projectRoot: string },
    ) => {
      ensureProjectRoot(args.projectRoot);
      const expanded = engine.execute(args.rawInput, args.projectRoot);
      return expanded ?? "";
    },
  );

  // ── CRUD ──

  ipcMain.handle(
    "commands:create",
    async (
      _event,
      args: { projectRoot: string; payload: CreateCommandPayload },
    ) => {
      ensureProjectRoot(args.projectRoot);
      return commandRegistry.create(args.payload);
    },
  );

  ipcMain.handle(
    "commands:update",
    async (
      _event,
      args: { projectRoot: string; id: string; payload: UpdateCommandPayload },
    ) => {
      ensureProjectRoot(args.projectRoot);
      return commandRegistry.update(args.id, args.payload);
    },
  );

  ipcMain.handle(
    "commands:delete",
    async (_event, args: { projectRoot: string; id: string }) => {
      ensureProjectRoot(args.projectRoot);
      commandRegistry.remove(args.id);
    },
  );

  ipcMain.handle(
    "commands:toggle",
    async (_event, args: { id: string; enabled: boolean }) => {
      commandRegistry.setEnabled(args.id, args.enabled);
      const cmd = commandRegistry.list().find((c) => c.id === args.id);
      if (cmd?.source === "builtin") {
        const settings = getSettings() as Record<string, unknown>;
        const states = {
          ...((settings.builtinCommands as Record<string, boolean> | undefined) ?? {}),
          [cmd.name]: args.enabled,
        };
        updateSettings({ builtinCommands: states } as Parameters<typeof updateSettings>[0]);
      }
      return engine.list();
    },
  );

  ipcMain.handle(
    "commands:reload",
    async (_event, args?: { projectRoot?: string | null }) => {
      if (args?.projectRoot) {
        commandRegistry.setProjectRoot(args.projectRoot);
      }
      return engine.reload();
    },
  );

  // ── Export / import ──

  ipcMain.handle(
    "commands:previewImport",
    async (_event, args: { projectRoot: string; pack: unknown }) => {
      ensureProjectRoot(args.projectRoot);
      return commandRegistry.previewImport(args.pack);
    },
  );

  ipcMain.handle(
    "commands:importPack",
    async (
      _event,
      args: {
        projectRoot: string;
        pack: unknown;
        strategy: CommandImportConflictStrategy;
      },
    ) => {
      ensureProjectRoot(args.projectRoot);
      return commandRegistry.importPack(args.pack, args.strategy);
    },
  );

  ipcMain.handle(
    "commands:writeExportFile",
    async (_event, args: { filePath: string; projectRoot: string }) => {
      ensureProjectRoot(args.projectRoot);
      const pack = commandRegistry.exportPack();
      writeFileSync(args.filePath, JSON.stringify(pack, null, 2), "utf-8");
    },
  );

  ipcMain.handle(
    "commands:readImportFile",
    async (_event, args: { filePath: string }) => {
      const raw = readFileSync(args.filePath, "utf-8");
      return JSON.parse(raw) as unknown;
    },
  );
}
