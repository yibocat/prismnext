// prism-next/src/main/ipc/packs.ts
// Pack 生命周期 IPC（§9.5）：listCatalog / install / setEnabled / uninstall /
// setContentEnabled / resolveBadge / getContentView / setDefaultOrchestrator。
import { ipcMain } from "electron";
import type { ContentKind, Fqid } from "../../shared/packs/types";
import { getPackContents } from "../services/pack-catalog";
import {
  isContentActive,
  listContent,
  listProjectPacks,
  notifyPacksChanged,
  resolveBadge,
} from "../services/pack-resolver";
import {
  installPack,
  setPackEnabledFlow,
  uninstallPack,
} from "../services/packs-lifecycle";
import { setContentDisabled, setDefaultOrchestratorFqid } from "../services/packs-state";

function requireProjectRoot(projectRoot: string | null | undefined): string {
  if (!projectRoot) throw new Error("No project root");
  return projectRoot;
}

const CONTENT_KINDS: ContentKind[] = ["orchestrator", "expert", "skill", "command"];

export function registerPacksHandlers(): void {
  // catalog ∪ 项目状态（ProjectPackView[]：installed/enabled/locked/compatible）
  ipcMain.handle("packs:listCatalog", async (_event, args?: { projectRoot?: string | null }) => {
    if (!args?.projectRoot) return [];
    return listProjectPacks(args.projectRoot);
  });

  ipcMain.handle(
    "packs:install",
    async (_event, args: { projectRoot: string; packId: string }) => {
      return installPack(requireProjectRoot(args.projectRoot), args.packId);
    },
  );

  ipcMain.handle(
    "packs:setEnabled",
    async (_event, args: { projectRoot: string; packId: string; enabled: boolean }) => {
      return setPackEnabledFlow(requireProjectRoot(args.projectRoot), args.packId, args.enabled);
    },
  );

  ipcMain.handle(
    "packs:uninstall",
    async (_event, args: { projectRoot: string; packId: string }) => {
      uninstallPack(requireProjectRoot(args.projectRoot), args.packId);
    },
  );

  // 逐项启停（§6.2 轻量操作：disabledContent 增删，视图经写入订阅即时失效）
  ipcMain.handle(
    "packs:setContentEnabled",
    async (_event, args: { projectRoot: string; fqid: Fqid; enabled: boolean }) => {
      setContentDisabled(requireProjectRoot(args.projectRoot), args.fqid, !args.enabled);
    },
  );

  // badge 唯一来源（§9.3 治 P10）：FQID 或裸 id
  ipcMain.handle(
    "packs:resolveBadge",
    async (_event, args?: { projectRoot?: string | null; fqidOrId?: string }) => {
      if (!args?.projectRoot || !args.fqidOrId) return null;
      return resolveBadge(args.projectRoot, args.fqidOrId);
    },
  );

  // 设置页分组数据（§9.2 行展开 = pack 内容项清单）
  ipcMain.handle(
    "packs:getContentView",
    async (_event, args?: { projectRoot?: string | null; kind?: string }) => {
      if (!args?.projectRoot) return [];
      const kind = args.kind as ContentKind | undefined;
      if (!kind || !CONTENT_KINDS.includes(kind)) return [];
      return listContent(args.projectRoot, kind);
    },
  );

  // catalog 级内容扫描（不要求安装；详情页展示「这个 pack 里有什么」用）
  ipcMain.handle("packs:getPackContents", async (_event, args?: { packId?: string }) => {
    if (!args?.packId) return [];
    try {
      return getPackContents(args.packId);
    } catch {
      return [];
    }
  });

  // §9.4 联动 UX 的确认动作：目标必须当前激活才允许设为默认
  ipcMain.handle(
    "packs:setDefaultOrchestrator",
    async (_event, args: { projectRoot: string; fqid: Fqid }) => {
      const root = requireProjectRoot(args.projectRoot);
      if (!isContentActive(root, args.fqid)) {
        throw new Error(`Orchestrator is not active: ${args.fqid}`);
      }
      setDefaultOrchestratorFqid(root, args.fqid);
      notifyPacksChanged(root);
    },
  );
}
