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
  APP_COMMANDS_OWNER_ID,
  CORE_TEAM_ID,
  PROJECT_DEFAULT_TEAM_ID,
} from "../../shared/teams/types";
import { parseFqid } from "../../shared/teams/state";
import type { AssetViewV2 } from "../../shared/teams/view";
import {
  invalidateResolver,
  listAssets,
  listEffectiveSlashCommands,
  resolveActiveTeam,
  resolveInvocation,
  resolveRef,
} from "../teams/resolver";
import { setProjectAssetEnabled } from "../teams/state-project";
import { resolveWritableTeamDir } from "../services/team-mcp-files";

/**
 * CommandRegistry — resolver facade for slash commands, per-project.
 * CRUD targets any writable team (Common / Project / user-created).
 */
export class CommandRegistry {
  constructor(private readonly projectRoot: string) {}

  private commandsDirFor(teamId: string): string {
    return join(resolveWritableTeamDir(this.projectRoot, teamId), "commands");
  }

  list(): CommandDef[] {
    return listAssets(this.projectRoot, "command").map((cmd) => toCommandDef(cmd));
  }

  lookup(name: string): CommandDef | undefined {
    const asset = resolveInvocation(this.projectRoot, "command", name);
    return asset ? toCommandDef(asset) : undefined;
  }

  search(query: string): CommandDef[] {
    const q = query.toLowerCase();
    const activeTeamId = resolveActiveTeam(this.projectRoot)?.manifest.id ?? null;
    return listEffectiveSlashCommands(this.projectRoot, activeTeamId)
      .map((asset) => toCommandDef(asset))
      .filter((c) => c.enabled)
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aApp = a.teamId === APP_COMMANDS_OWNER_ID ? 0 : 1;
        const bApp = b.teamId === APP_COMMANDS_OWNER_ID ? 0 : 1;
        if (aApp !== bApp) return aApp - bApp;
        return a.order - b.order;
      });
  }

  reload(): CommandDef[] {
    invalidateResolver(this.projectRoot);
    return this.list();
  }

  create(payload: CreateCommandPayload): CommandDef {
    const teamId = payload.targetTeamId?.trim() || PROJECT_DEFAULT_TEAM_ID;
    const dir = this.commandsDirFor(teamId);
    mkdirSync(dir, { recursive: true });

    if (this.teamCommands(teamId).some((c) => c.name === payload.name)) {
      throw new Error(`Command already exists: ${payload.name}`);
    }

    const def: CommandDef = {
      id: `${teamId}:${payload.name}`,
      name: payload.name,
      description: payload.description,
      source: "user",
      template: payload.template,
      action: payload.action || undefined,
      agent: payload.agent,
      model: payload.model,
      order: 1000,
      enabled: true,
      teamId,
      teamName: teamId,
      removable: true,
    };

    this.writeFile(def, teamId);
    invalidateResolver(this.projectRoot);
    return def;
  }

  update(id: string, payload: UpdateCommandPayload): CommandDef {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (!existing.removable) throw new Error(`Cannot modify pack command (disable it instead): ${id}`);

    const teamId = existing.teamId;
    if (payload.name && payload.name !== existing.name) {
      this.deleteFile(existing.name, teamId);
    }

    const updated: CommandDef = {
      ...existing,
      name: payload.name ?? existing.name,
      id: `${teamId}:${payload.name ?? existing.name}`,
      description: payload.description ?? existing.description,
      template: payload.template ?? existing.template,
      action:
        payload.action !== undefined
          ? payload.action.trim() || undefined
          : existing.action,
      agent: payload.agent !== undefined ? payload.agent : existing.agent,
      model: payload.model !== undefined ? payload.model : existing.model,
    };

    this.writeFile(updated, teamId);
    invalidateResolver(this.projectRoot);
    return updated;
  }

  remove(id: string): void {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (!existing.removable) throw new Error(`Cannot delete pack command (disable it instead): ${id}`);
    this.deleteFile(existing.name, existing.teamId);
    setProjectAssetEnabled(this.projectRoot, existing.id, true);
    invalidateResolver(this.projectRoot);
  }

  setEnabled(id: string, enabled: boolean): void {
    const fqid = parseFqid(id)
      ? id
      : resolveRef(this.projectRoot, id, undefined, "command");
    if (!fqid) throw new Error(`Command not found: ${id}`);
    setProjectAssetEnabled(this.projectRoot, fqid, enabled ? true : false);
  }

  exportPack(): CommandPack {
    return buildCommandPack(this.exportableCommands());
  }

  previewImport(packRaw: unknown): CommandImportPreview {
    const pack = parseCommandPack(packRaw);
    const existingNames = new Set(this.exportableCommands().map((c) => c.name));
    return previewCommandImport(existingNames, pack);
  }

  importPack(packRaw: unknown, strategy: CommandImportConflictStrategy): CommandImportResult {
    const pack = parseCommandPack(packRaw);
    const result: CommandImportResult = {
      imported: 0,
      skipped: 0,
      renamed: [],
    };

    const existingNames = new Set(this.exportableCommands().map((c) => c.name));
    const teamId = PROJECT_DEFAULT_TEAM_ID;

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
        id: `${teamId}:${targetName}`,
        name: targetName,
        description: entry.description ?? "",
        source: "user",
        template: entry.template ?? "",
        action: entry.action || undefined,
        agent: entry.agent || undefined,
        model: entry.model || undefined,
        order: 1000,
        enabled: entry.enabled !== false,
        teamId,
        teamName: "This project",
        removable: true,
      };

      if (strategy === "replace" && existingNames.has(baseName) && targetName === baseName) {
        this.deleteFile(baseName, teamId);
      }

      this.writeFile(def, teamId);
      if (!def.enabled) {
        setProjectAssetEnabled(this.projectRoot, def.id, false);
      }
      existingNames.add(targetName);
      result.imported += 1;
    }

    invalidateResolver(this.projectRoot);
    return result;
  }

  /** User-editable commands across writable teams (export / import conflict set). */
  private exportableCommands(): CommandDef[] {
    return this.list().filter((c) => c.removable);
  }

  private teamCommands(teamId: string): CommandDef[] {
    return this.list().filter((c) => c.teamId === teamId);
  }

  private filePath(name: string, teamId: string): string {
    return join(this.commandsDirFor(teamId), `${name}.md`);
  }

  private writeFile(def: CommandDef, teamId: string): void {
    const dir = this.commandsDirFor(teamId);
    mkdirSync(dir, { recursive: true });

    const fmValue = (v: string) => v.replace(/\s+/g, " ").trim();
    const frontmatter = [
      "---",
      `description: ${fmValue(def.description || "")}`,
      ...(def.action ? [`action: ${fmValue(def.action)}`] : []),
      ...(def.agent ? [`agent: ${fmValue(def.agent)}`] : []),
      ...(def.model ? [`model: ${fmValue(def.model)}`] : []),
      `order: ${def.order ?? 1000}`,
      "---",
    ].join("\n");

    const content = `${frontmatter}\n\n${def.template || ""}\n`;
    writeFileSync(this.filePath(def.name, teamId), content, "utf-8");
  }

  private deleteFile(name: string, teamId: string): void {
    const path = this.filePath(name, teamId);
    if (existsSync(path)) rmSync(path, { force: true });
  }
}

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
    source:
      teamId === APP_COMMANDS_OWNER_ID || teamId === CORE_TEAM_ID
        ? "builtin"
        : asset.editable
          ? "user"
          : "plugin",
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

const registryPool = new Map<string, CommandRegistry>();

export function getCommandRegistry(projectRoot: string): CommandRegistry {
  let registry = registryPool.get(projectRoot);
  if (!registry) {
    registry = new CommandRegistry(projectRoot);
    registryPool.set(projectRoot, registry);
  }
  return registry;
}

export function __resetCommandRegistriesForTests(): void {
  registryPool.clear();
}
