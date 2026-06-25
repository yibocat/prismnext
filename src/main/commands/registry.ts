// prism-next/src/main/commands/registry.ts
import { readdirSync, readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from "node:fs";
import { join, basename, extname } from "node:path";
import type { CommandDef, CreateCommandPayload, UpdateCommandPayload } from "./types";
import { BUILTIN_COMMANDS } from "./builtin-commands";
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

/**
 * CommandRegistry — merges three layers into a unified list.
 *
 * Layer priority (highest wins):
 *   1. User custom commands (shadow built-in of same name)
 *   2. App commands
 *   3. OpenCode built-in commands
 *
 * Cached in memory; call reload() after filesystem changes.
 */
export class CommandRegistry {
  private cache: CommandDef[] | null = null;
  private projectRoot: string | null = null;

  /** Path to user commands directory */
  private get commandsDir(): string {
    return join(this.projectRoot!, ".prismnext", "agent", "commands");
  }

  /**
   * Set the active project root. Resets the cache.
   */
  setProjectRoot(root: string | null): void {
    this.projectRoot = root;
    this.cache = null;
  }

  /**
   * Return the full merged command list (all three layers).
   * User commands shadow built-in commands of the same name.
   */
  list(): CommandDef[] {
    if (this.cache) return this.cache;
    this.cache = this.buildList();
    return this.cache;
  }

  /**
   * Look up a single command by name.
   * Returns undefined if not found or disabled.
   */
  lookup(name: string): CommandDef | undefined {
    return this.list().find((c) => c.name === name && c.enabled);
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
   * Reload: flush cache and rescan user command files.
   */
  reload(): CommandDef[] {
    this.cache = null;
    return this.list();
  }

  // ── User command CRUD ──

  /**
   * Create a new user command as a .md file.
   */
  create(payload: CreateCommandPayload): CommandDef {
    this.ensureDir();

    const def: CommandDef = {
      id: `user:${payload.name}`,
      name: payload.name,
      description: payload.description,
      source: "user",
      template: payload.template,
      action: payload.action || undefined,
      agent: payload.agent,
      model: payload.model,
      order: 1000,
      enabled: true,
    };

    this.writeFile(def);
    this.cache = null;
    return def;
  }

  /**
   * Update an existing user command.
   */
  update(id: string, payload: UpdateCommandPayload): CommandDef {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (existing.source !== "user") throw new Error(`Cannot modify built-in command: ${id}`);

    // If name changed, delete old file
    if (payload.name && payload.name !== existing.name) {
      this.deleteFile(existing);
    }

    const updated: CommandDef = {
      ...existing,
      name: payload.name ?? existing.name,
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
    this.cache = null;
    return updated;
  }

  /**
   * Delete a user command (removes the .md file).
   */
  remove(id: string): void {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);
    if (existing.source !== "user") throw new Error(`Cannot delete built-in command: ${id}`);
    this.deleteFile(existing);
    this.cache = null;
  }

  /**
   * Enable or disable any command by id.
   * For user commands: renames .md ↔ .md.disabled
   * For built-in: toggles in-memory only.
   */
  setEnabled(id: string, enabled: boolean): void {
    const existing = this.list().find((c) => c.id === id);
    if (!existing) throw new Error(`Command not found: ${id}`);

    if (existing.source === "user") {
      const oldPath = this.filePath(existing.name, existing.enabled);
      const newPath = this.filePath(existing.name, enabled);
      if (existsSync(oldPath) && oldPath !== newPath) {
        renameSync(oldPath, newPath);
      }
    }

    existing.enabled = enabled;
    this.cache = null;
  }

  /**
   * Restore built-in command enabled states from persisted settings.
   */
  applyBuiltinStates(states: Record<string, boolean>): void {
    for (const cmd of BUILTIN_COMMANDS) {
      if (cmd.name in states) {
        cmd.enabled = states[cmd.name];
      }
    }
    this.cache = null;
  }

  /**
   * Export built-in command enabled states for persistence.
   */
  dumpBuiltinStates(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const cmd of BUILTIN_COMMANDS) {
      result[cmd.name] = cmd.enabled;
    }
    return result;
  }

  exportPack(): CommandPack {
    return buildCommandPack(this.scanUserCommands());
  }

  previewImport(packRaw: unknown): CommandImportPreview {
    const pack = parseCommandPack(packRaw);
    const existingNames = new Set(this.scanUserCommands().map((c) => c.name));
    return previewCommandImport(existingNames, pack);
  }

  importPack(packRaw: unknown, strategy: CommandImportConflictStrategy): CommandImportResult {
    const pack = parseCommandPack(packRaw);
    const result: CommandImportResult = {
      imported: 0,
      skipped: 0,
      renamed: [],
    };

    const existingNames = new Set(this.scanUserCommands().map((c) => c.name));

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
        id: `user:${targetName}`,
        name: targetName,
        description: entry.description ?? "",
        source: "user",
        template: entry.template ?? "",
        action: entry.action || undefined,
        agent: entry.agent || undefined,
        model: entry.model || undefined,
        order: 1000,
        enabled: entry.enabled !== false,
      };

      if (strategy === "replace" && existingNames.has(baseName) && targetName === baseName) {
        const existing = this.list().find((c) => c.id === `user:${baseName}`);
        if (existing && existing.source === "user" && existing.name !== targetName) {
          this.deleteFile(existing);
        }
      }

      this.writeFile(def);
      existingNames.add(targetName);
      result.imported += 1;
    }

    this.cache = null;
    return result;
  }

  // ── Private helpers ──

  private buildList(): CommandDef[] {
    const userCommands = this.scanUserCommands();
    const userNames = new Set(userCommands.map((c) => c.name));
    const builtins = BUILTIN_COMMANDS.filter((c) => !userNames.has(c.name));
    return [...builtins, ...userCommands];
  }

  private scanUserCommands(): CommandDef[] {
    if (!this.projectRoot) return [];
    const dir = this.commandsDir;
    if (!existsSync(dir)) return [];

    const commands: CommandDef[] = [];
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.endsWith(".disabled")) continue;
        if (!entry.endsWith(".md") && !entry.endsWith(".mdx")) continue;

        const filePath = join(dir, entry);
        try {
          const def = this.parseFile(filePath);
          if (def) commands.push(def);
        } catch (err: any) {
          console.warn(`[commands] Skipping invalid command file ${entry}: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.warn(`[commands] Failed to scan ${dir}: ${err.message}`);
    }

    return commands;
  }

  private parseFile(filePath: string): CommandDef | null {
    const raw = readFileSync(filePath, "utf-8");

    // Parse YAML frontmatter (--- ... ---)
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!fmMatch) {
      // No frontmatter — entire file is the template
      const name = basename(filePath, extname(filePath));
      return {
        id: `user:${name}`,
        name,
        description: "",
        source: "user",
        template: raw.trim(),
        order: 1000,
        enabled: true,
      };
    }

    const fmRaw = fmMatch[1];
    const body = fmMatch[2].trim();

    // Simple YAML parser (flat keys only, no library needed)
    const fm: Record<string, string> = {};
    for (const line of fmRaw.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key) fm[key] = value;
    }

    const name = basename(filePath, extname(filePath));

    return {
      id: `user:${name}`,
      name,
      description: fm.description || "",
      source: "user",
      template: body,
      action: fm.action || undefined,
      agent: fm.agent || undefined,
      model: fm.model || undefined,
      order: 1000,
      enabled: fm.enabled !== "false",
    };
  }

  private filePath(name: string, enabled: boolean): string {
    const ext = enabled ? ".md" : ".md.disabled";
    return join(this.commandsDir, `${name}${ext}`);
  }

  private writeFile(def: CommandDef): void {
    this.ensureDir();

    const frontmatter = [
      "---",
      `description: ${def.description || ""}`,
      ...(def.action ? [`action: ${def.action}`] : []),
      ...(def.agent ? [`agent: ${def.agent}`] : []),
      ...(def.model ? [`model: ${def.model}`] : []),
      `enabled: ${def.enabled}`,
      "---",
    ].join("\n");

    const content = `${frontmatter}\n\n${def.template || ""}\n`;
    const path = this.filePath(def.name, def.enabled);
    writeFileSync(path, content, "utf-8");
  }

  private deleteFile(def: CommandDef): void {
    const path = this.filePath(def.name, def.enabled);
    if (existsSync(path)) unlinkSync(path);
    const altPath = this.filePath(def.name, !def.enabled);
    if (existsSync(altPath)) unlinkSync(altPath);
  }

  private ensureDir(): void {
    if (!this.projectRoot) throw new Error("No project root set");
    const dir = this.commandsDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/** Singleton */
export const commandRegistry = new CommandRegistry();
