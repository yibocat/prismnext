// prism-next/src/main/commands/registry.ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CommandDef, CreateCommandPayload, UpdateCommandPayload } from "./types";
import {
  buildCommandPack,
  parseCommandPack,
  previewCommandImport,
  type CommandImportConflictStrategy,
  type CommandImportPreview,
  type CommandImportResult,
  type CommandPack,
} from "./export-import";
import { isValidCommandName } from "./template-utils";
import { CORE_TEAM_ID, LOCAL_TEAM_ID, LOCAL_TEAM_REL } from "../../shared/teams/types";
import { parseFqid } from "../../shared/teams/state";
import type { ResolvedCommand } from "../../shared/teams/types";
import { invalidateResolver, listCommands, resolveBareContentId } from "../services/team-resolver";
import { setAssetDisabled } from "../services/teams-state";

/**
 * CommandRegistry（§5.6.3）—— resolver 之上的命令门面，per-project 实例。
 *
 * 内容唯一来源 = PackResolver.listCommands（core + local + 启用 packs）。
 * 本类不持有内容缓存（resolver 视图自校验新鲜度）：
 * - 启停 = packs.json disabledContent（废弃 .md ↔ .md.disabled 改名与
 *   applyBuiltinStates/dumpBuiltinStates 全局态）；
 * - CRUD 只允许 Local Pack（remove 对非 local 直接报错——结构上杜绝 P9）；
 * - 斜杠重名遮蔽优先级：local > core > 其他 pack（id 字典序）。
 */
export class CommandRegistry {
  constructor(private readonly projectRoot: string) {}

  /** Local Pack commands 目录 */
  private get commandsDir(): string {
    return join(this.projectRoot, LOCAL_TEAM_REL, "commands");
  }

  list(): CommandDef[] {
    return listCommands(this.projectRoot).map((cmd) => toCommandDef(cmd));
  }

  /**
   * Look up a single command by name for slash execution.
   * 同名遮蔽优先级：local > core > 其他 pack（与 resolver bare-id 语义一致）。
   * Returns undefined if not found or disabled.
   */
  lookup(name: string): CommandDef | undefined {
    const matches = this.list().filter((c) => c.name === name && c.enabled);
    if (matches.length === 0) return undefined;
    return (
      matches.find((c) => c.teamId === LOCAL_TEAM_ID) ??
      matches.find((c) => c.teamId === CORE_TEAM_ID) ??
      matches.sort((a, b) => a.teamId.localeCompare(b.teamId))[0]
    );
  }

  /**
   * Search commands by name or description substring.
   */
  search(query: string): CommandDef[] {
    const q = query.toLowerCase();
    return this.list()
      .filter((c) => c.enabled)
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Reload: drop the resolver view for this project and rebuild.
   * （resolver 的 viewKey 已覆盖文件指纹，多数情况下只是预热。）
   */
  reload(): CommandDef[] {
    invalidateResolver(this.projectRoot);
    return this.list();
  }

  // ── Local Pack command CRUD（只允许 user.local）──

  /**
   * Create a new local command as a .md file in the Local Pack.
   */
  create(payload: CreateCommandPayload): CommandDef {
    this.ensureDir();

    const def: CommandDef = {
      id: `${LOCAL_TEAM_ID}:${payload.name}`,
      name: payload.name,
      description: payload.description,
      source: "user",
      template: payload.template,
      action: payload.action || undefined,
      agent: payload.agent,
      model: payload.model,
      order: 1000,
      enabled: true,
      teamId: LOCAL_TEAM_ID,
      teamName: "My Content",
      removable: true,
    };

    this.writeFile(def);
    invalidateResolver(this.projectRoot);
    return def;
  }

  /**
   * Update an existing local command.
   */
  update(id: string, payload: UpdateCommandPayload): CommandDef {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (!existing.removable) throw new Error(`Cannot modify pack command (disable it instead): ${id}`);

    // If name changed, delete old file
    if (payload.name && payload.name !== existing.name) {
      this.deleteFile(existing.name);
    }

    const updated: CommandDef = {
      ...existing,
      name: payload.name ?? existing.name,
      id: `${LOCAL_TEAM_ID}:${payload.name ?? existing.name}`,
      description: payload.description ?? existing.description,
      template: payload.template ?? existing.template,
      action:
        payload.action !== undefined
          ? payload.action.trim() || undefined
          : existing.action,
      agent: payload.agent !== undefined ? payload.agent : existing.agent,
      model: payload.model !== undefined ? payload.model : existing.model,
    };

    this.writeFile(updated);
    invalidateResolver(this.projectRoot);
    return updated;
  }

  /**
   * Delete a local command (removes the .md file).
   * 非 local 内容直接报错 —— pack 内容只能禁用（P9 结构性修复）。
   */
  remove(id: string): void {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (!existing.removable) throw new Error(`Cannot delete pack command (disable it instead): ${id}`);
    this.deleteFile(existing.name);
    // 清理可能残留的逐项禁用
    setAssetDisabled(this.projectRoot, existing.id, false);
    invalidateResolver(this.projectRoot);
  }

  /**
   * Enable or disable any command by id —— 唯一状态操作 = packs.json
   * disabledContent（FQID 原样；裸 id 按 resolver 规则解析兜底）。
   */
  setEnabled(id: string, enabled: boolean): void {
    const fqid = parseFqid(id)
      ? id
      : resolveBareContentId(this.projectRoot, "command", id);
    if (!fqid) throw new Error(`Command not found: ${id}`);
    setAssetDisabled(this.projectRoot, fqid, !enabled);
  }

  // ── Export / import（作用域 = Local Pack commands）──

  exportPack(): CommandPack {
    return buildCommandPack(this.localCommands());
  }

  previewImport(packRaw: unknown): CommandImportPreview {
    const pack = parseCommandPack(packRaw);
    const existingNames = new Set(this.localCommands().map((c) => c.name));
    return previewCommandImport(existingNames, pack);
  }

  importPack(packRaw: unknown, strategy: CommandImportConflictStrategy): CommandImportResult {
    const pack = parseCommandPack(packRaw);
    const result: CommandImportResult = {
      imported: 0,
      skipped: 0,
      renamed: [],
    };

    const existingNames = new Set(this.localCommands().map((c) => c.name));

    for (const entry of pack.commands) {
      const baseName = entry.name?.trim().toLowerCase();
      if (!baseName || !isValidCommandName(baseName)) continue;

      let targetName = baseName;
      if (existingNames.has(baseName)) {
        if (strategy === "skip") {
          result.skipped += 1;
          continue;
        }
        if (strategy === "rename") {
          let n = 2;
          while (existingNames.has(`${baseName}-${n}`)) n += 1;
          targetName = `${baseName}-${n}`;
          result.renamed.push({ from: baseName, to: targetName });
        }
      }

      const def: CommandDef = {
        id: `${LOCAL_TEAM_ID}:${targetName}`,
        name: targetName,
        description: entry.description ?? "",
        source: "user",
        template: entry.template ?? "",
        action: entry.action || undefined,
        agent: entry.agent || undefined,
        model: entry.model || undefined,
        order: 1000,
        enabled: entry.enabled !== false,
        teamId: LOCAL_TEAM_ID,
        teamName: "My Content",
        removable: true,
      };

      if (strategy === "replace" && existingNames.has(baseName) && targetName === baseName) {
        this.deleteFile(baseName);
      }

      this.writeFile(def);
      if (!def.enabled) {
        setAssetDisabled(this.projectRoot, def.id, true);
      }
      existingNames.add(targetName);
      result.imported += 1;
    }

    invalidateResolver(this.projectRoot);
    return result;
  }

  // ── Private helpers ──

  /** Local Pack 的命令视图（export/import 作用域） */
  private localCommands(): CommandDef[] {
    return this.list().filter((c) => c.teamId === LOCAL_TEAM_ID);
  }

  private filePath(name: string): string {
    return join(this.commandsDir, `${name}.md`);
  }

  private writeFile(def: CommandDef): void {
    this.ensureDir();

    const frontmatter = [
      "---",
      `description: ${def.description || ""}`,
      ...(def.action ? [`action: ${def.action}`] : []),
      ...(def.agent ? [`agent: ${def.agent}`] : []),
      ...(def.model ? [`model: ${def.model}`] : []),
      "---",
    ].join("\n");

    const content = `${frontmatter}\n\n${def.template || ""}\n`;
    writeFileSync(this.filePath(def.name), content, "utf-8");
  }

  private deleteFile(name: string): void {
    const path = this.filePath(name);
    if (existsSync(path)) rmSync(path, { force: true });
  }

  private ensureDir(): void {
    if (!existsSync(this.commandsDir)) mkdirSync(this.commandsDir, { recursive: true });
  }
}

function toCommandDef(cmd: ResolvedCommand): CommandDef {
  const teamId = cmd.origin.teamId;
  return {
    id: cmd.fqid,
    name: cmd.name,
    description: cmd.description,
    source: teamId === CORE_TEAM_ID ? "builtin" : teamId === LOCAL_TEAM_ID ? "user" : "plugin",
    template: cmd.template,
    action: cmd.action,
    agent: cmd.agent,
    model: cmd.model,
    order: cmd.order,
    enabled: cmd.enabled,
    teamId,
    teamName: cmd.origin.teamName,
    removable: teamId === LOCAL_TEAM_ID,
  };
}

// ── per-project 实例池（§5.6.3：删除全局可写态）─────────────────

const registryPool = new Map<string, CommandRegistry>();

export function getCommandRegistry(projectRoot: string): CommandRegistry {
  let registry = registryPool.get(projectRoot);
  if (!registry) {
    registry = new CommandRegistry(projectRoot);
    registryPool.set(projectRoot, registry);
  }
  return registry;
}

/** 测试专用：清空实例池 */
export function __resetCommandRegistriesForTests(): void {
  registryPool.clear();
}
