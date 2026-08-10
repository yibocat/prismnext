import { ipcMain } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  listProjectSkills,
  readSkillsManifest,
  deleteProjectSkill,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  setSkillLibrarySourceConnected,
  listLibrarySources,
  PRISM_CURATED_SOURCE_ID,
  activeRemoteRegistryUrls,
  PRISM_LOCAL_SKILLS_REL,
  setSkillContentEnabled,
  type InstalledSkillInfo,
  type SkillLibrarySourceInfo,
} from "../services/skills-sync";
import {
  fetchLibraryCatalog,
  installAllFromLibrarySource,
  installLibraryCatalogItem,
  uninstallAllFromLibrarySource,
} from "../services/skill-library-catalog";
import { refreshProjectSkillsIntegration, refreshProjectSkillsIntegrationWithReload } from "../services/project-skills-refresh";
import { analyzeSkillSource, checkSkillUpdates, installSkillPackages, reinstallSkill } from "../services/skill-install";
import {
  fetchRegistryIndex,
  installRegistrySkill,
  validateRegistryIndex,
  type RegistrySkillEntry,
} from "../services/skills-registry";
import { CORE_TEAM_ID } from "../../shared/teams/types";
import { toFqid } from "../../shared/teams/state";
import { listCorePackSkills, readCoreSkillMd } from "../services/core-team-skills";

function refreshProjectSkills(
  projectPath: string,
) {
  return refreshProjectSkillsIntegrationWithReload(projectPath);
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
      const result = await addSkillLibrarySource(args.projectPath, args.registryUrl);
      return {
        sources: result.sources,
        indexUrl: result.indexUrl ?? "",
        skillCount: result.packageCount,
        sourceKind: result.sourceKind,
      };
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

  ipcMain.handle("agent:listBundledSkills", async () => listCorePackSkills());

  ipcMain.handle(
    "agent:installBundledSkill",
    async (_event, args: { projectPath: string; skillId: string }) => {
      // 引用模型：core pack 技能天然可用，「安装」= 确保启用（零拷贝）
      setSkillContentEnabled(args.projectPath, toFqid(CORE_TEAM_ID, args.skillId), true);
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle("agent:readBundledSkillMd", async (_event, args: { skillId: string }) => {
    return readCoreSkillMd(args.skillId);
  });

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
      const result = await addSkillLibrarySource(args.projectPath, args.registryUrl);
      return {
        registryUrls: activeRemoteRegistryUrls(
          result.sources.map(({ id, kind, url, connected }) => ({ id, kind, url, connected })),
        ),
        indexUrl: result.indexUrl ?? "",
        skillCount: result.packageCount,
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
      // 启停唯一状态操作 = teams.json assetEnabled（D3）；skillId 为 FQID
      // （列表项自带），裸 id 按 resolver 规则解析兜底。
      const fqid = setSkillContentEnabled(args.projectPath, args.skillId, args.enabled);
      if (!fqid) throw new Error(`Skill not found: ${args.skillId}`);
      const integration = await refreshProjectSkillsIntegration(args.projectPath);
      return {
        ...integration,
        skills: listProjectSkills(args.projectPath),
      };
    },
  );

  ipcMain.handle(
    "agent:installSkill",
    async (
      _event,
      args: { projectPath: string; skillId: string; content: string },
    ) => {
      const skillDir = join(args.projectPath, PRISM_LOCAL_SKILLS_REL, args.skillId);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, "SKILL.md"), args.content, "utf-8");
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:installSkillFromRegistry",
    async (
      _event,
      args: {
        projectPath: string;
        skillName: string;
        artifactUrl: string;
        artifactType?: RegistrySkillEntry["type"];
        files?: string[];
        indexUrl: string;
      },
    ) => {
      const entry: RegistrySkillEntry = {
        name: args.skillName,
        description: "",
        type: args.artifactType ?? "skill-md",
        url: args.artifactUrl,
        files: args.files,
      };
      await installRegistrySkill(args.projectPath, entry, args.indexUrl);
      return refreshProjectSkills(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:analyzeSkillSource",
    async (_event, args: { input: string }) => {
      return analyzeSkillSource(args.input);
    },
  );

  ipcMain.handle(
    "agent:installSkillPackages",
    async (
      _event,
      args: {
        projectPath: string;
        selection: import("../../shared/skill-install-types").SkillPackageInstallSelection;
      },
    ) => {
      const { installedIds } = await installSkillPackages(args.projectPath, args.selection);
      const refresh = await refreshProjectSkills(args.projectPath);
      return { ...refresh, installedIds };
    },
  );

  ipcMain.handle(
    "agent:reinstallSkill",
    async (_event, args: { projectPath: string; skillId: string }) => {
      const { installedIds } = await reinstallSkill(args.projectPath, args.skillId);
      const refresh = await refreshProjectSkills(args.projectPath);
      return { ...refresh, installedIds };
    },
  );

  ipcMain.handle(
    "agent:checkSkillUpdates",
    async (_event, args: { projectPath: string }) => {
      return checkSkillUpdates(args.projectPath);
    },
  );

  ipcMain.handle(
    "agent:fetchSkillLibraryCatalog",
    async (_event, args: { projectPath: string; sourceId: string }) => {
      return fetchLibraryCatalog(args.projectPath, args.sourceId);
    },
  );

  ipcMain.handle(
    "agent:installLibraryCatalogItem",
    async (
      _event,
      args: {
        projectPath: string;
        item: import("../../shared/skill-library-types").LibraryCatalogItem;
      },
    ) => {
      const { installedIds } = await installLibraryCatalogItem(args.projectPath, args.item);
      const refresh = await refreshProjectSkills(args.projectPath);
      return { ...refresh, installedIds };
    },
  );

  ipcMain.handle(
    "agent:installAllFromLibrarySource",
    async (_event, args: { projectPath: string; sourceId: string }) => {
      const { installedIds } = await installAllFromLibrarySource(args.projectPath, args.sourceId);
      const refresh = await refreshProjectSkills(args.projectPath);
      return { ...refresh, installedIds };
    },
  );

  ipcMain.handle(
    "agent:uninstallAllFromLibrarySource",
    async (_event, args: { projectPath: string; sourceId: string }) => {
      const { removedIds } = await uninstallAllFromLibrarySource(args.projectPath, args.sourceId);
      const refresh = await refreshProjectSkills(args.projectPath);
      return { ...refresh, removedIds };
    },
  );

  ipcMain.handle(
    "agent:deleteSkill",
    async (_event, args: { projectPath: string; skillId: string }) => {
      deleteProjectSkill(args.projectPath, args.skillId);
      return refreshProjectSkills(args.projectPath);
    },
  );
}
