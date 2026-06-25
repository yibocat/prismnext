import type { CommandDef } from "./types";
import { isValidCommandName } from "./template-utils";

export const COMMAND_PACK_VERSION = 1;

export interface CommandPackEntry {
  name: string;
  description: string;
  template: string;
  action?: string;
  agent?: string;
  model?: string;
  enabled?: boolean;
}

export interface CommandPack {
  version: typeof COMMAND_PACK_VERSION;
  exportedAt: string;
  commands: CommandPackEntry[];
}

export type CommandImportConflictStrategy = "skip" | "replace" | "rename";

export interface CommandImportPreview {
  incoming: string[];
  conflicts: string[];
  invalid: string[];
}

export interface CommandImportResult {
  imported: number;
  skipped: number;
  renamed: Array<{ from: string; to: string }>;
}

export function buildCommandPack(commands: CommandDef[]): CommandPack {
  return {
    version: COMMAND_PACK_VERSION,
    exportedAt: new Date().toISOString(),
    commands: commands.map((c) => ({
      name: c.name,
      description: c.description,
      template: c.template,
      action: c.action,
      agent: c.agent,
      model: c.model,
      enabled: c.enabled,
    })),
  };
}

export function parseCommandPack(raw: unknown): CommandPack {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid command pack: expected a JSON object.");
  }
  const pack = raw as Partial<CommandPack>;
  if (pack.version !== COMMAND_PACK_VERSION) {
    throw new Error(`Unsupported pack version: ${pack.version ?? "missing"}`);
  }
  if (!Array.isArray(pack.commands)) {
    throw new Error("Invalid command pack: commands must be an array.");
  }
  return {
    version: COMMAND_PACK_VERSION,
    exportedAt: pack.exportedAt ?? new Date().toISOString(),
    commands: pack.commands,
  };
}

export function previewCommandImport(
  existingNames: Set<string>,
  pack: CommandPack,
): CommandImportPreview {
  const incoming: string[] = [];
  const conflicts: string[] = [];
  const invalid: string[] = [];

  for (const entry of pack.commands) {
    const name = entry.name?.trim().toLowerCase();
    if (!name || !isValidCommandName(name)) {
      invalid.push(entry.name ?? "(missing name)");
      continue;
    }
    incoming.push(name);
    if (existingNames.has(name)) conflicts.push(name);
  }

  return { incoming, conflicts, invalid };
}

function resolveImportName(
  baseName: string,
  existingNames: Set<string>,
  strategy: CommandImportConflictStrategy,
): { name: string; skipped: boolean; renamed: boolean } {
  if (!existingNames.has(baseName)) {
    return { name: baseName, skipped: false, renamed: false };
  }

  if (strategy === "skip") {
    return { name: baseName, skipped: true, renamed: false };
  }

  if (strategy === "replace") {
    return { name: baseName, skipped: false, renamed: false };
  }

  let n = 2;
  while (existingNames.has(`${baseName}-${n}`)) n += 1;
  return { name: `${baseName}-${n}`, skipped: false, renamed: true };
}

export function mergeCommandImport(
  existing: CommandDef[],
  pack: CommandPack,
  strategy: CommandImportConflictStrategy,
  createEntry: (entry: CommandPackEntry, name: string) => CommandDef,
): { defs: CommandDef[]; result: CommandImportResult } {
  const byName = new Map(existing.map((c) => [c.name, c]));
  const existingNames = new Set(byName.keys());

  const result: CommandImportResult = {
    imported: 0,
    skipped: 0,
    renamed: [],
  };

  for (const entry of pack.commands) {
    const baseName = entry.name?.trim().toLowerCase();
    if (!baseName || !isValidCommandName(baseName)) continue;

    const resolved = resolveImportName(baseName, existingNames, strategy);
    if (resolved.skipped) {
      result.skipped += 1;
      continue;
    }

    if (resolved.renamed) {
      result.renamed.push({ from: baseName, to: resolved.name });
    }

    const def = createEntry(entry, resolved.name);
    byName.set(resolved.name, def);
    existingNames.add(resolved.name);
    result.imported += 1;
  }

  return { defs: [...byName.values()], result };
}
