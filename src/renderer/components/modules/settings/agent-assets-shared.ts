/** Shared props / helpers for the Settings → Teams hub panes. */

export type AgentAssetPaneProps = {
  /** Omit page chrome — parent hub provides title / search / tabs. */
  embedded?: boolean;
  /** Case-insensitive filter for the current tab’s list. */
  searchQuery?: string;
};

export type AgentAssetsTab = "teams" | "skills" | "commands" | "mcp";

/** Settings categories that all resolve to the Teams hub. */
export const AGENT_ASSETS_CATEGORIES = [
  "teams-agents",
  "skills",
  "commands",
  "tools-mcp",
] as const;

export function isAgentAssetsCategory(category: string): boolean {
  return (AGENT_ASSETS_CATEGORIES as readonly string[]).includes(category);
}

export function settingsCategoryToAgentAssetsTab(category: string): AgentAssetsTab {
  switch (category) {
    case "skills":
      return "skills";
    case "commands":
      return "commands";
    case "tools-mcp":
      return "mcp";
    default:
      return "teams";
  }
}

export function agentAssetsTabToSettingsCategory(tab: AgentAssetsTab): string {
  switch (tab) {
    case "skills":
      return "skills";
    case "commands":
      return "commands";
    case "mcp":
      return "tools-mcp";
    default:
      return "teams-agents";
  }
}

/** Shared haystack match for asset / team rows. */
export function matchesAgentAssetQuery(
  query: string | undefined,
  ...parts: Array<string | undefined | null>
): boolean {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  return parts.some((p) => (p ?? "").toLowerCase().includes(q));
}
