import { parseMcpConfig } from "@/lib/agent/mcp-config";

export type SlashCatalogSkill = { id: string; name: string; enabled: boolean };
export type SlashCatalogMcp = { name: string };

const MCP_REL = ".prismnext/agent/mcp.json";

/** Load installed skills + MCP servers — same sources as Settings → Skills / MCP. */
export async function loadSlashCatalog(projectRoot: string | null): Promise<{
  skills: SlashCatalogSkill[];
  mcps: SlashCatalogMcp[];
}> {
  if (!projectRoot) return { skills: [], mcps: [] };

  const mcpPath = `${projectRoot}/${MCP_REL}`;

  const [skills, mcps] = await Promise.all([
    window.electronAPI.agentListSkills(projectRoot).catch(() => [] as SlashCatalogSkill[]),
    window.electronAPI.fsExists(mcpPath).then(async (exists) => {
      if (!exists) return [] as SlashCatalogMcp[];
      try {
        const { content } = await window.electronAPI.fsRead(mcpPath);
        return parseMcpConfig(content ?? "")
          .filter((entry) => entry.enabled !== false)
          .map((entry) => ({ name: entry.name }));
      } catch {
        return [];
      }
    }),
  ]);

  return { skills, mcps };
}
