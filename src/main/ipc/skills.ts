import { ipcMain } from "electron";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  listProjectSkills,
  readSkillsManifest,
  writeSkillsManifest,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  setSkillLibrarySourceConnected,
  listLibrarySources,
  PRISM_CURATED_SOURCE_ID,
  activeRemoteRegistryUrls,
  PRISM_SKILLS_REL,
  type InstalledSkillInfo,
  type SkillLibrarySourceInfo,
} from "../services/skills-sync";
import { refreshProjectSkillsIntegrationWithReload } from "../services/project-skills-refresh";
import {
  fetchRegistryIndex,
  fetchSkillMarkdown,
  normalizeRegistryIndexUrl,
  skillNameToFolderId,
} from "../services/skills-registry";
import {
  listBundledSkills,
  copyBundledSkillToProject,
} from "../services/bundled-skills";

function refreshProjectSkills(
  projectPath: string,
  options?: { profileSkillAllowlist?: string[] },
) {
  return refreshProjectSkillsIntegrationWithReload(projectPath, options);
}

export function registerSkillsHandlers(): void {
  ipcMain.handle("agent:listSkills", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as InstalledSkillInfo[];
    return listProjectSkills(args.projectPath);
  });

  ipcMain.handle("agent:listSkillRegistries", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as string[];
    const sources = readSkillsManifest(args.projectPath).sources ?? [];
    return activeRemoteRegistryUrls(sources);
  });

  ipcMain.handle("agent:listSkillLibrarySources", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return [] as SkillLibrarySourceInfo[];
    return listLibrarySources(args.projectPath);
  });

  ipcMain.handle(
    "agent:addSkillLibrarySource",
    async (_event, args: { projectPath: string; registryUrl: string }) => {
      const indexUrl = normalizeRegistryIndexUrl(args.registryUrl);
      const sources = addSkillLibrarySource(args.projectPath, indexUrl);
      return { sources, indexUrl };
    },
  );

  ipcMain.handle(
    "agent:removeSkillLibrarySource",
    async (_event, args: { projectPath: string; sourceId: string }) => {
      const sources = removeSkillLibrarySource(args.projectPath, args.sourceId);
      return { sources };
    },
  );

  ipcMain.handle(
    "agent:setSkillLibrarySourceConnected",
    async (_event, args: { projectPath: string; sourceId: string; connected: boolean }) => {
      const sources = setSkillLibrarySourceConnected(
        args.projectPath,
        args.sourceId,
        args.connected,
      );
      return { sources };
    },
  );

  ipcMain.handle("agent:listBundledSkills", async () => listBundledSkills());

  ipcMain.handle(
    "agent:installBundledSkill",
    async (_event, args: { projectPath: string; skillId: string }) => {
      copyBundledSkillToProject(args.projectPath, args.skillId);
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle("agent:syncSkills", async (_event, args: { projectPath: string }) => {
    if (!args.projectPath) return { skillsCount: 0, configPath: "", registryUrls: [] as string[] };
    return refreshProjectSkills(args.projectPath);
  });

  ipcMain.handle(
    "agent:fetchSkillRegistry",
    async (_event, args: { registryUrl: string }) => {
      return fetchRegistryIndex(args.registryUrl);
    },
  );

  ipcMain.handle(
    "agent:connectSkillRegistry",
    async (_event, args: { projectPath: string; registryUrl: string }) => {
      const indexUrl = normalizeRegistryIndexUrl(args.registryUrl);
      const sources = addSkillLibrarySource(args.projectPath, indexUrl);
      return {
        registryUrls: activeRemoteRegistryUrls(
          sources.map(({ id, kind, url, connected }) => ({ id, kind, url, connected })),
        ),
        indexUrl,
      };
    },
  );

  ipcMain.handle(
    "agent:disconnectSkillRegistry",
    async (_event, args: { projectPath: string; registryUrl: string }) => {
      const manifest = readSkillsManifest(args.projectPath);
      const target = (manifest.sources ?? []).find(
        (s) => s.kind === "remote" && s.url === args.registryUrl.trim(),
      );
      const sources = target
        ? setSkillLibrarySourceConnected(args.projectPath, target.id, false)
        : listLibrarySources(args.projectPath);
      return {
        registryUrls: activeRemoteRegistryUrls(
          sources.map(({ id, kind, url, connected }) => ({ id, kind, url, connected })),
        ),
      };
    },
  );

  ipcMain.handle(
    "agent:setSkillEnabled",
    async (_event, args: { projectPath: string; skillId: string; enabled: boolean }) => {
      const manifest = readSkillsManifest(args.projectPath);
      const disabled = new Set(manifest.disabled ?? []);
      if (args.enabled) {
        disabled.delete(args.skillId);
      } else {
        disabled.add(args.skillId);
      }
      writeSkillsManifest(args.projectPath, { ...manifest, disabled: Array.from(disabled) });
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:installSkill",
    async (
      _event,
      args: { projectPath: string; skillId: string; content: string },
    ) => {
      const skillDir = join(args.projectPath, PRISM_SKILLS_REL, args.skillId);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), args.content, "utf-8");
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:installSkillFromRegistry",
    async (
      _event,
      args: { projectPath: string; skillName: string; artifactUrl: string },
    ) => {
      const content = await fetchSkillMarkdown(args.artifactUrl);
      const skillId = skillNameToFolderId(args.skillName);
      const skillDir = join(args.projectPath, PRISM_SKILLS_REL, skillId);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:deleteSkill",
    async (_event, args: { projectPath: string; skillId: string }) => {
      const skillDir = join(args.projectPath, PRISM_SKILLS_REL, args.skillId);
      if (existsSync(skillDir)) {
        rmSync(skillDir, { recursive: true, force: true });
      }
      const manifest = readSkillsManifest(args.projectPath);
      const disabled = (manifest.disabled ?? []).filter((id) => id !== args.skillId);
      writeSkillsManifest(args.projectPath, { ...manifest, disabled });
      return refreshProjectSkills(args.projectPath);
    },
  );
}
