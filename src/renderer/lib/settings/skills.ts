import { agentDesktop } from "@/lib/desktop-api/agent";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { shellDesktop } from "@/lib/desktop-api/shell";
import { teamsDesktop } from "@/lib/desktop-api/teams";
import type { AssetViewV2 } from "@shared/teams/view";
import type { LibraryCatalogItem } from "@shared/skills/library-types";

export type InstalledSkill = Awaited<
  ReturnType<typeof agentDesktop.agentListSkills>
>[number];

export type SkillLibrarySource = Awaited<
  ReturnType<typeof agentDesktop.agentListSkillLibrarySources>
>[number];

export type SkillUpdateRow = Awaited<
  ReturnType<typeof agentDesktop.agentCheckSkillUpdates>
>[number];

export async function listProjectSkills(
  projectRoot: string,
): Promise<InstalledSkill[]> {
  try {
    return await agentDesktop.agentListSkills(projectRoot);
  } catch {
    return [];
  }
}

export async function listSkillAssets(projectRoot: string): Promise<AssetViewV2[]> {
  try {
    return await teamsDesktop.teamsListAssets(projectRoot, "skill");
  } catch {
    return [];
  }
}

export async function reinstallProjectSkill(
  projectRoot: string,
  skillId: string,
) {
  return agentDesktop.agentReinstallSkill(projectRoot, skillId);
}

export async function checkProjectSkillUpdates(projectRoot: string) {
  return agentDesktop.agentCheckSkillUpdates(projectRoot);
}

export async function deleteProjectSkill(projectRoot: string, fqid: string) {
  return agentDesktop.agentDeleteSkill(projectRoot, fqid);
}

export async function installProjectSkill(
  projectRoot: string,
  skillId: string,
  content: string,
  targetTeamId?: string,
) {
  return agentDesktop.agentInstallSkill(projectRoot, skillId, content, targetTeamId);
}

export async function readBundledSkillMd(skillId: string): Promise<string | null> {
  return agentDesktop.agentReadBundledSkillMd(skillId);
}

export async function readSkillMdFile(absPath: string): Promise<string> {
  const result = await fsDesktop.fsRead(absPath);
  return result?.content ?? "";
}

export async function revealHomeSkillsFolder(): Promise<void> {
  const dir = await agentDesktop.agentHomeSkillsDir();
  if (dir) await shellDesktop.shellShowItemInFolder(dir);
}

export async function listSkillLibrarySources(
  projectRoot: string,
): Promise<SkillLibrarySource[]> {
  try {
    return await agentDesktop.agentListSkillLibrarySources(projectRoot);
  } catch {
    return [];
  }
}

export async function fetchSkillLibraryCatalog(
  projectRoot: string,
  sourceId: string,
) {
  return agentDesktop.agentFetchSkillLibraryCatalog(projectRoot, sourceId);
}

export async function installSkillLibraryItem(
  projectRoot: string,
  item: LibraryCatalogItem,
) {
  return agentDesktop.agentInstallLibraryCatalogItem(projectRoot, item);
}

export async function installAllSkillsFromLibrarySource(
  projectRoot: string,
  sourceId: string,
) {
  return agentDesktop.agentInstallAllFromLibrarySource(projectRoot, sourceId);
}

export async function addSkillLibrarySource(projectRoot: string, input: string) {
  return agentDesktop.agentAddSkillLibrarySource(projectRoot, input);
}

export async function setSkillLibrarySourceConnected(
  projectRoot: string,
  sourceId: string,
  connected: boolean,
) {
  return agentDesktop.agentSetSkillLibrarySourceConnected(
    projectRoot,
    sourceId,
    connected,
  );
}

export async function removeSkillLibrarySource(
  projectRoot: string,
  sourceId: string,
) {
  return agentDesktop.agentRemoveSkillLibrarySource(projectRoot, sourceId);
}
