import type { McpServerEntry } from "./mcp-config";

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
  /** Shown first in Settings → MCP catalog (research / writing workflow). */
  recommended?: boolean;
  /**
   * Prism-shipped default: always seeded into project mcp.json, always enabled.
   * Settings shows a Built-in badge; remove/disable are blocked in the UI.
   */
  builtin?: boolean;
}

export const MCP_CATEGORY_LABELS: Record<McpPresetCategory, string> = {
  dev: "Development",
  search: "Search",
  data: "Data",
  productivity: "Productivity",
};

/** Curated catalog — prefer official @modelcontextprotocol servers with clear research value. */
export const MCP_PRESETS: McpPreset[] = [
  {
    id: "paper-search-mcp",
    name: "Paper Search",
    description:
      "Built-in academic paper search (arXiv, PubMed, Semantic Scholar, Crossref, …). Runs via npx — no Python.",
    category: "search",
    type: "local",
    builtin: true,
    recommended: true,
    command: ["npx", "-y", "paper-search-mcp-nodejs"],
    docsUrl: "https://github.com/Dianel555/paper-search-mcp-nodejs",
    fields: [
      {
        key: "SEMANTIC_SCHOLAR_API_KEY",
        label: "Semantic Scholar (optional — higher rate limits)",
        secret: true,
      },
      {
        key: "PUBMED_API_KEY",
        label: "PubMed / NCBI (optional — higher rate limits)",
        secret: true,
      },
      {
        key: "WOS_API_KEY",
        label: "Web of Science (required for WoS search)",
        secret: true,
      },
      {
        key: "WOS_API_VERSION",
        label: "Web of Science API version (optional, default v1)",
        placeholder: "v1",
      },
      {
        key: "ELSEVIER_API_KEY",
        label: "Elsevier (required for ScienceDirect & Scopus)",
        secret: true,
      },
      {
        key: "SPRINGER_API_KEY",
        label: "Springer Nature (required for Springer search)",
        secret: true,
      },
      {
        key: "SPRINGER_OPENACCESS_API_KEY",
        label: "Springer OpenAccess (optional, if separate from main key)",
        secret: true,
      },
      {
        key: "WILEY_TDM_TOKEN",
        label: "Wiley TDM token (required for Wiley PDF download)",
        secret: true,
      },
      {
        key: "SCHOLAR_PROXY",
        label: "Google Scholar proxy (optional, if blocked)",
        placeholder: "http://user:pass@host:port",
        secret: true,
      },
    ],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch web pages and convert to markdown",
    category: "search",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-fetch"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via Brave Search API",
    category: "search",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-brave-search"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    fields: [
      {
        key: "BRAVE_API_KEY",
        label: "Brave Search API key",
        secret: true,
        required: true,
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    description: "Issues, pull requests, and repository context",
    category: "dev",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-github"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github",
    fields: [
      {
        key: "GITHUB_PERSONAL_ACCESS_TOKEN",
        label: "GitHub personal access token",
        secret: true,
        required: true,
        placeholder: "ghp_…",
      },
    ],
  },
  {
    id: "git",
    name: "Git",
    description: "Read and search a local git repository",
    category: "dev",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-git"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    fields: [
      {
        key: "__path__",
        label: "Repository path",
        required: true,
        appendToCommand: true,
        placeholder: "/path/to/repo",
      },
    ],
  },
  {
    id: "memory",
    name: "Memory",
    description: "Persistent key-value memory across sessions",
    category: "productivity",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query a local SQLite database file",
    category: "data",
    type: "local",
    recommended: true,
    command: ["npx", "-y", "@modelcontextprotocol/server-sqlite"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
    fields: [
      {
        key: "__path__",
        label: "Database file path",
        required: true,
        appendToCommand: true,
        placeholder: "/path/to/database.sqlite",
      },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Query a PostgreSQL database",
    category: "data",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-postgres"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    fields: [
      {
        key: "__path__",
        label: "Connection string",
        required: true,
        appendToCommand: true,
        placeholder: "postgresql://user:pass@localhost:5432/db",
        secret: true,
      },
    ],
  },
];

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
