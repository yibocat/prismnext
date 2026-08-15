/**
 * Curated MCP install presets — data lives in `resources/mcp/presets.json`.
 * Edit that file to add/remove/change presets; this module only validates and
 * converts them for the Settings UI.
 */
import type { McpServerEntry } from "./mcp-config";
import presetsFile from "../../../../resources/mcp/presets.json";

export type McpPresetCategory = "dev" | "search" | "data" | "productivity";

export interface McpPresetField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  required?: boolean;
  /** Append value as the last command argument (paths, connection strings). */
  appendToCommand?: boolean;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  category: McpPresetCategory;
  type: "local" | "remote";
  command?: string[];
  url?: string;
  docsUrl?: string;
  fields?: McpPresetField[];
  /** Shown first in Settings → MCP install panel. */
  recommended?: boolean;
  /**
   * Seeded into a writable team's mcp.json on new projects only.
   * Settings may show a Built-in badge; users may still disable/remove it.
   */
  builtin?: boolean;
}

export const MCP_CATEGORY_LABELS: Record<McpPresetCategory, string> = {
  dev: "Development",
  search: "Search",
  data: "Data",
  productivity: "Productivity",
};

const CATEGORIES = new Set<McpPresetCategory>([
  "dev",
  "search",
  "data",
  "productivity",
]);

function normalizePreset(raw: unknown): McpPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const description = typeof o.description === "string" ? o.description : "";
  const category = o.category as McpPresetCategory;
  const type = o.type === "remote" ? "remote" : o.type === "local" ? "local" : null;
  if (!id || !name || !type || !CATEGORIES.has(category)) return null;

  const command = Array.isArray(o.command)
    ? o.command.filter((p): p is string => typeof p === "string" && p.length > 0)
    : undefined;
  const fields = Array.isArray(o.fields)
    ? o.fields.flatMap((f): McpPresetField[] => {
        if (!f || typeof f !== "object") return [];
        const field = f as Record<string, unknown>;
        const key = typeof field.key === "string" ? field.key.trim() : "";
        const label = typeof field.label === "string" ? field.label : key;
        if (!key) return [];
        return [{
          key,
          label,
          secret: field.secret === true,
          required: field.required === true,
          appendToCommand: field.appendToCommand === true,
          placeholder: typeof field.placeholder === "string" ? field.placeholder : undefined,
        }];
      })
    : undefined;

  return {
    id,
    name,
    description,
    category,
    type,
    command,
    url: typeof o.url === "string" ? o.url : undefined,
    docsUrl: typeof o.docsUrl === "string" ? o.docsUrl : undefined,
    fields,
    recommended: o.recommended === true,
    builtin: o.builtin === true,
  };
}

function loadPresets(): McpPreset[] {
  const list = Array.isArray((presetsFile as { presets?: unknown }).presets)
    ? (presetsFile as { presets: unknown[] }).presets
    : [];
  return list.flatMap((raw) => {
    const preset = normalizePreset(raw);
    return preset ? [preset] : [];
  });
}

/** Curated catalog from `resources/mcp/presets.json`. */
export const MCP_PRESETS: McpPreset[] = loadPresets();

export function getMcpPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((p) => p.id === id);
}

/** Built-in MCP server ids (must stay enabled in every project). */
export function isBuiltinMcpServer(name: string): boolean {
  return getMcpPreset(name)?.builtin === true;
}

export function presetRequiresFields(preset: McpPreset): boolean {
  return (preset.fields?.length ?? 0) > 0;
}

/** Whether an installed server should expose a Configure action in Settings. */
export function serverIsConfigurable(entry: McpServerEntry): boolean {
  const preset = findPresetForEntry(entry);
  if (!preset) return true;
  return presetRequiresFields(preset);
}

export function presetFieldsValid(preset: McpPreset, values: Record<string, string>): boolean {
  if (!preset.fields?.length) return true;
  return preset.fields.every((f) => {
    if (!f.required) return true;
    return Boolean(values[f.key]?.trim());
  });
}

export function presetToEntry(
  preset: McpPreset,
  values: Record<string, string> = {},
): McpServerEntry | null {
  if (!presetFieldsValid(preset, values)) return null;

  const environment: Record<string, string> = {};
  let command = preset.command ? [...preset.command] : [];

  for (const field of preset.fields ?? []) {
    const value = values[field.key]?.trim();
    if (!value) continue;
    if (field.appendToCommand) {
      command.push(value);
    } else {
      environment[field.key] = value;
    }
  }

  if (preset.type === "local" && command.length === 0) return null;
  if (preset.type === "remote" && !preset.url?.trim()) return null;

  return {
    name: preset.id,
    type: preset.type,
    enabled: true,
    command: preset.type === "local" ? command : [],
    environment,
    url: preset.type === "remote" ? (preset.url ?? "") : "",
    headers: {},
  };
}

/** Match installed server to a built-in preset (by id + command prefix). */
export function findPresetForEntry(entry: McpServerEntry): McpPreset | undefined {
  const preset = getMcpPreset(entry.name);
  if (!preset) return undefined;
  if (preset.type !== entry.type) return undefined;
  if (preset.type === "remote") {
    return preset.url === entry.url ? preset : undefined;
  }
  const presetCmd = preset.command ?? [];
  if (presetCmd.length === 0) return preset;
  const entryPrefix = entry.command.slice(0, presetCmd.length);
  if (entryPrefix.join("\0") !== presetCmd.join("\0")) return undefined;
  return preset;
}

export function entryFieldValues(entry: McpServerEntry, preset: McpPreset): Record<string, string> {
  const values: Record<string, string> = {};
  const cmdTail = entry.command.slice(preset.command?.length ?? 0);

  for (const field of preset.fields ?? []) {
    if (field.appendToCommand) {
      values[field.key] = cmdTail[0] ?? "";
    } else {
      values[field.key] = entry.environment[field.key] ?? "";
    }
  }
  return values;
}
