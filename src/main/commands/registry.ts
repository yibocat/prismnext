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
import {
  CORE_TEAM_ID,
  isProjectLocalTeamId,
  PROJECT_DEFAULT_TEAM_ID,
} from "../../shared/teams/types";
import { parseFqid } from "../../shared/teams/state";
import type { AssetViewV2 } from "../../shared/teams/view";
import { invalidateResolver, listAssets, resolveInvocation, resolveRef } from "../teams/resolver";
import { setProjectAssetEnabled } from "../teams/state-project";
import { ensureProjectDefaultTeamDir } from "../teams/migrate-project-content";

/**
 * CommandRegistry（§5.6.3）—— resolver 之上的命令门面，per-project 实例。
 *
 * 内容唯一来源 = PackResolver.listCommands（core + local + 启用 packs）。
 * 本类不持有内容缓存（resolver 视图自校验新鲜度）：
 * - 启停 = teams.json assetEnabled (tri-state)（废弃 .md ↔ .md.disabled 改名与
 *   applyBuiltinStates/dumpBuiltinStates 全局态）；
 * - CRUD 只允许 Local Pack（remove 对非 local 直接报错——结构上杜绝 P9）；
 * - 斜杠重名遮蔽优先级：local > core > 其他 pack（id 字典序）。
 */
export class CommandRegistry {
  constructor(private readonly projectRoot: string) {}

  /** Project default team commands 目录（M8: teams/project.local/commands） */
  private get commandsDir(): string {
    return join(ensureProjectDefaultTeamDir(this.projectRoot), "commands");
  }

  list(): CommandDef[] {
    return listAssets(this.projectRoot, "command").map((cmd) => toCommandDef(cmd));
  }

  /**
   * Look up a single command by name for slash execution.
   * Goes through the resolver's single precedence table (§7.5) — no local
   * shadowing logic here. Returns undefined if not found or disabled.
   */
  lookup(name: string): CommandDef | undefined {
    const asset = resolveInvocation(this.projectRoot, "command", name);
    return asset ? toCommandDef(asset) : undefined;
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

  // ── Project-local command CRUD ────────────────────────────

  /**
   * Create a new local command as a .md file in the Local Pack.
   */
  create(payload: CreateCommandPayload): CommandDef {
    this.ensureDir();
    // Reject creating a command whose name already exists in the Local Pack
    // (silent overwrite is a data-loss footgun).
    if (this.localCommands().some((c) => c.name === payload.name)) {
      throw new Error(`Command already exists: ${payload.name}`);
    }

    const def: CommandDef = {
      id: `${PROJECT_DEFAULT_TEAM_ID}:${payload.name}`,
      name: payload.name,
      description: payload.description,
      source: "user",
      template: payload.template,
      action: payload.action || undefined,
      agent: payload.agent,
      model: payload.model,
      order: 1000,
      enabled: true,
      teamId: PROJECT_DEFAULT_TEAM_ID,
      teamName: "This project",
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
      id: `${PROJECT_DEFAULT_TEAM_ID}:${payload.name ?? existing.name}`,
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
    setProjectAssetEnabled(this.projectRoot, existing.id, true);
    invalidateResolver(this.projectRoot);
  }

  /**
   * Enable or disable any command by id —— 唯一状态操作 = teams.json
   * assetEnabled (tri-state)（FQID 原样；裸 id 按 resolver 规则解析兜底）。
   */
  setEnabled(id: string, enabled: boolean): void {
    const fqid = parseFqid(id)
      ? id
      : resolveRef(this.projectRoot, id, undefined, "command");
    if (!fqid) throw new Error(`Command not found: ${id}`);
    setProjectAssetEnabled(this.projectRoot, fqid, enabled ? true : false);
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
        id: `${PROJECT_DEFAULT_TEAM_ID}:${targetName}`,
        name: targetName,
        description: entry.description ?? "",
        source: "user",
        template: entry.template ?? "",
        action: entry.action || undefined,
        agent: entry.agent || undefined,
        model: entry.model || undefined,
        order: 1000,
        enabled: entry.enabled !== false,
        teamId: PROJECT_DEFAULT_TEAM_ID,
        teamName: "This project",
        removable: true,
      };

      if (strategy === "replace" && existingNames.has(baseName) && targetName === baseName) {
        this.deleteFile(baseName);
      }

      this.writeFile(def);
      if (!def.enabled) {
        setProjectAssetEnabled(this.projectRoot, def.id, false);
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
    return this.list().filter((c) => isProjectLocalTeamId(c.teamId));
  }

  private filePath(name: string): string {
    return join(this.commandsDir, `${name}.md`);
  }

  private writeFile(def: CommandDef): void {
    this.ensureDir();

    // Frontmatter values are single-line; collapse newlines so a multi-line
    // description can't corrupt the file (the flat parser splits on ":").
    const fmValue = (v: string) => v.replace(/\s+/g, " ").trim();
    const frontmatter = [
      "---",
      `description: ${fmValue(def.description || "")}`,
      ...(def.action ? [`action: ${fmValue(def.action)}`] : []),
      ...(def.agent ? [`agent: ${fmValue(def.agent)}`] : []),
      ...(def.model ? [`model: ${fmValue(def.model)}`] : []),
      // order is persisted so user-defined ordering survives a reload (B12).
      `order: ${def.order ?? 1000}`,
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

/** Map a resolved command asset to the legacy CommandDef shape. */
function toCommandDef(asset: AssetViewV2): CommandDef {
  const teamId = asset.teamId;
  const cmd = (asset.definition ?? {}) as {
    template?: string;
    action?: string;
    agent?: string;
    model?: string;
    order?: number;
  };
  return {
    id: asset.fqid,
    name: asset.id,
    description: asset.description,
    source: teamId === CORE_TEAM_ID ? "builtin" : isProjectLocalTeamId(teamId) ? "user" : "plugin",
    template: cmd.template ?? "",
    action: cmd.action,
    agent: cmd.agent,
    model: cmd.model,
    order: cmd.order ?? 1000,
    enabled: asset.enabled,
    teamId,
    teamName: asset.origin.teamName,
    removable: asset.editable,
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
