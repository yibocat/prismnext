// prism-next/src/main/ipc/commands.ts
import { writeFileSync, readFileSync } from "node:fs";
import { ipcMain } from "electron";
import { CommandEngine } from "../commands";
import { getCommandRegistry } from "../commands/registry";
import type {
  CreateCommandPayload,
  UpdateCommandPayload,
} from "../commands/types";
import type { CommandImportConflictStrategy } from "../commands/export-import";
import { assertUnderHome } from "../services/active-project-roots";

const engine = CommandEngine.getInstance();

function requireProjectRoot(projectRoot: string | null | undefined): string {
  if (!projectRoot) throw new Error("No project root");
  return projectRoot;
}

export function registerCommandsHandlers(): void {
  // ── Query ──

  ipcMain.handle(
    "commands:list",
    async (_event, args?: { projectRoot?: string | null }) => {
      // 无项目 → 空列表（命令解析需要项目态 teams.json）
      if (!args?.projectRoot) return [];
      return engine.list(args.projectRoot);
    },
  );

  ipcMain.handle(
    "commands:expand",
    async (
      _event,
      args: { name: string; rawInput: string; projectRoot: string },
    ) => {
      const expanded = engine.execute(args.rawInput, requireProjectRoot(args.projectRoot));
      return expanded ?? "";
    },
  );

  // ── CRUD（Local Pack only —— 非 local 在 registry 层报错）──

  ipcMain.handle(
    "commands:create",
    async (
      _event,
      args: { projectRoot: string; payload: CreateCommandPayload },
    ) => {
      return getCommandRegistry(requireProjectRoot(args.projectRoot)).create(args.payload);
    },
  );

  ipcMain.handle(
    "commands:update",
    async (
      _event,
      args: { projectRoot: string; id: string; payload: UpdateCommandPayload },
    ) => {
      return getCommandRegistry(requireProjectRoot(args.projectRoot)).update(args.id, args.payload);
    },
  );

  ipcMain.handle(
    "commands:delete",
    async (_event, args: { projectRoot: string; id: string }) => {
      getCommandRegistry(requireProjectRoot(args.projectRoot)).remove(args.id);
    },
  );

  ipcMain.handle(
    "commands:toggle",
    async (_event, args: { projectRoot: string; id: string; enabled: boolean }) => {
      const root = requireProjectRoot(args.projectRoot);
      // 启停唯一状态操作 = teams.json assetEnabled（registry 内完成）；
      // settings 的 builtinCommands 全局持久化已在 Phase 3 移除（R11 迁移）。
      getCommandRegistry(root).setEnabled(args.id, args.enabled);
      return engine.list(root);
    },
  );

  ipcMain.handle(
    "commands:reload",
    async (_event, args?: { projectRoot?: string | null }) => {
      if (!args?.projectRoot) return [];
      return engine.reload(args.projectRoot);
    },
  );

  // ── Export / import（作用域 = Local Pack commands）──

  ipcMain.handle(
    "commands:previewImport",
    async (_event, args: { projectRoot: string; pack: unknown }) => {
      return getCommandRegistry(requireProjectRoot(args.projectRoot)).previewImport(args.pack);
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
      return getCommandRegistry(requireProjectRoot(args.projectRoot)).importPack(args.pack, args.strategy);
    },
  );

  ipcMain.handle(
    "commands:writeExportFile",
    async (_event, args: { filePath: string; projectRoot: string }) => {
      assertUnderHome(args.filePath, "commands:writeExportFile");
      const pack = getCommandRegistry(requireProjectRoot(args.projectRoot)).exportPack();
      writeFileSync(args.filePath, JSON.stringify(pack, null, 2), "utf-8");
    },
  );

  ipcMain.handle(
    "commands:readImportFile",
    async (_event, args: { filePath: string }) => {
      assertUnderHome(args.filePath, "commands:readImportFile");
      const raw = readFileSync(args.filePath, "utf-8");
      return JSON.parse(raw) as unknown;
    },
  );
}
