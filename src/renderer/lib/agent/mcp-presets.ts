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
}

export const MCP_CATEGORY_LABELS: Record<McpPresetCategory, string> = {
  dev: "Development",
  search: "Search",
  data: "Data",
  productivity: "Productivity",
};

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Issues, pull requests, and repository context",
    category: "dev",
    type: "local",
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
    id: "filesystem",
    name: "Filesystem",
    description: "Read and write files in allowed directories",
    category: "dev",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    fields: [
      {
        key: "__path__",
        label: "Allowed directory path",
        required: true,
        appendToCommand: true,
        placeholder: "/path/to/folder",
      },
    ],
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "Fetch web pages and convert to markdown",
    category: "search",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-fetch"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via Brave Search API",
    category: "search",
    type: "local",
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
    id: "memory",
    name: "Memory",
    description: "Persistent key-value memory across sessions",
    category: "productivity",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-memory"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured step-by-step reasoning tool",
    category: "productivity",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-sequential-thinking"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser automation for scraping and testing",
    category: "dev",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-puppeteer"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer",
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "Query a local SQLite database file",
    category: "data",
    type: "local",
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
  {
    id: "slack",
    name: "Slack",
    description: "Read channels and post messages",
    category: "productivity",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-slack"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    fields: [
      {
        key: "SLACK_BOT_TOKEN",
        label: "Slack bot token",
        secret: true,
        required: true,
        placeholder: "xoxb-…",
      },
      {
        key: "SLACK_TEAM_ID",
        label: "Slack team ID",
        required: true,
        placeholder: "T…",
      },
    ],
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Inspect Sentry issues and events",
    category: "dev",
    type: "local",
    command: ["npx", "-y", "@modelcontextprotocol/server-sentry"],
    docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/sentry",
    fields: [
      {
        key: "SENTRY_AUTH_TOKEN",
        label: "Sentry auth token",
        secret: true,
        required: true,
      },
      {
        key: "SENTRY_ORG",
        label: "Sentry organization slug",
        required: true,
      },
    ],
  },
  {
    id: "git",
    name: "Git",
    description: "Read and search local git repositories",
    category: "dev",
    type: "local",
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
];

export function getMcpPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((p) => p.id === id);
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
