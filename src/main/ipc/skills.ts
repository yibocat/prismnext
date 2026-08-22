import { ipcMain } from "electron";
import {
  listProjectSkills,
  readSkillsManifest,
  deleteProjectSkill,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  setSkillLibrarySourceConnected,
  listLibrarySources,
  activeRemoteRegistryUrls,
  setSkillContentEnabled,
  type InstalledSkillInfo,
  type SkillLibrarySourceInfo,
} from "../skills/skills-sync";
import {
  fetchLibraryCatalog,
  installAllFromLibrarySource,
  installLibraryCatalogItem,
  uninstallAllFromLibrarySource,
} from "../skills/skill-library-catalog";
import { refreshProjectSkillsIntegration, refreshProjectSkillsIntegrationWithReload } from "../skills/project-skills-refresh";
import { analyzeSkillSource, checkSkillUpdates, installSkillPackages, reinstallSkill } from "../skills/skill-install";
import {
  fetchRegistryIndex,
  installRegistrySkill,
  validateRegistryIndex,
  type RegistrySkillEntry,
} from "../skills/skills-registry";
import { CORE_TEAM_ID } from "../../shared/teams/types";
import { toFqid } from "../../shared/teams/state";
import { listCorePackSkills, readCoreSkillMd } from "../teams/core-team-skills";

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
      args: {
        projectPath: string;
        skillId: string;
        content: string;
        targetTeamId?: string;
      },
    ) => {
      const { installProjectSkill } = await import("../skills/skills-sync");
      installProjectSkill(
        args.projectPath,
        args.skillId,
        args.content,
        args.targetTeamId,
      );
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
        selection: import("../../shared/skills/install-types").SkillPackageInstallSelection;
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
        item: import("../../shared/skills/library-types").LibraryCatalogItem;
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

  ipcMain.handle("agent:homeSkillsDir", async () => {
    const { homeSkillsDir } = await import("../workbench/home");
    const { mkdirSync } = await import("node:fs");
    const dir = homeSkillsDir();
    mkdirSync(dir, { recursive: true });
    return dir;
  });
}
