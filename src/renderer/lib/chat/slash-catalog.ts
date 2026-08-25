import { teamsDesktop } from "@/lib/desktop-api/teams";
import { listProjectSkills } from "@/lib/settings/skills";

export type SlashCatalogSkill = { id: string; name: string; enabled: boolean };
export type SlashCatalogMcp = { name: string };

/**
 * Load installed skills + MCP servers — same sources as Settings → Skills / MCP.
 * MCP entries come from `teams:listMcp` (project mcp.json + every enabled
 * team's MCP servers), so team-provided MCPs appear in the `/` menu and can
 * actually be lazy-loaded (B1 fix — previously only project mcp.json was read,
 * so team MCPs were unreachable).
 */
export async function loadSlashCatalog(projectRoot: string | null): Promise<{
  skills: SlashCatalogSkill[];
  mcps: SlashCatalogMcp[];
}> {
  if (!projectRoot) return { skills: [], mcps: [] };

  const [skills, mcps] = await Promise.all([
    listProjectSkills(projectRoot),
    teamsDesktop
      .teamsListMcp(projectRoot)
      .then((list) =>
        list.filter((entry) => entry.enabled).map((entry) => ({ name: entry.name })),
      )
      .catch(() => [] as SlashCatalogMcp[]),
  ]);

  return { skills, mcps };
}
