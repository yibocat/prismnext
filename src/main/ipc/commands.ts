// prism-next/src/main/ipc/commands.ts
import { ipcMain } from "electron";
import { CommandEngine } from "../commands";
import { commandRegistry } from "../commands/registry";
import { getSettings, updateSettings } from "../services/settings";
import type { CreateCommandPayload, UpdateCommandPayload } from "../commands/types";

const engine = CommandEngine.getInstance();

export function registerCommandsHandlers(): void {
  // ── Query ──

  ipcMain.handle("commands:list", async () => {
    return engine.list();
  });

  ipcMain.handle(
    "commands:expand",
    async (
      _event,
      args: { name: string; rawInput: string; projectRoot: string },
    ) => {
      const expanded = engine.execute(args.rawInput, args.projectRoot);
      return expanded ?? "";
    },
  );

  // ── CRUD ──

  ipcMain.handle(
    "commands:create",
    async (_event, payload: CreateCommandPayload) => {
      return commandRegistry.create(payload);
    },
  );

  ipcMain.handle(
    "commands:update",
    async (_event, args: { id: string; payload: UpdateCommandPayload }) => {
      return commandRegistry.update(args.id, args.payload);
    },
  );

  ipcMain.handle(
    "commands:delete",
    async (_event, args: { id: string }) => {
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

  ipcMain.handle("commands:reload", async () => {
    return engine.reload();
  });
}
