import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import {
  listProjectSkills,
  readSkillsManifest,
  syncProjectSkillsIntegration,
  writeSkillsManifest,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  listLibrarySources,
  setSkillContentEnabled,
  PRISM_CURATED_SOURCE_ID,
  PRISM_LOCAL_SKILLS_REL,
  OPENCODE_HIDDEN_SKILLS,
  PRISM_OPENCODE_SKILLS_SCAN_REL,
  buildSkillPermissions,
  computeProfileSkillDisabled,
  sanitizeSkillPermissionMap,
  skillPermissionNeedsRepair,
  isSkillsIntegrationPath,
  projectRootFromAgentPath,
} from "../../src/main/services/skills-sync";
import {
  listExternalTeamRoots,
  registerExternalTeamRoot,
  unregisterExternalTeamRoot,
} from "../../src/main/teams/catalog";
import { setAppAssetEnabled, setAppTeamEnabled, setAppTeamsStateDataDir } from "../../src/main/teams/state-app";
import {
  addInstalledTeam,
  setTeamsInstalledDataDir,
} from "../../src/main/services/teams-installed";
import { __resetTeamsResolverForTests, listAssets as listAssetsV2 } from "../../src/main/teams/resolver";
import { CORE_TEAM_ID, MY_CONTENT_TEAM_ID, PROJECT_DEFAULT_TEAM_ID } from "../../src/shared/teams/types";
import { homeSkillDir, homeSkillsDir, homeSkillsManifestPath, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import { HOME_SKILLS_DIRNAME } from "../../src/shared/workbench-paths";
import { baseManifest, makePack, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(prefix = "prism-skills-"): string {
  const dir = makeTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

function writeLocalSkill(id: string, extra = ""): void {
  const dir = homeSkillDir(id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${id} desc\n---\n${extra}\n# ${id}\n`,
    "utf-8",
  );
}

beforeEach(() => {
  const home = makeTempDir("wb-skills-home-");
  tempDirs.push(home);
  setWorkbenchUserHomeOverride(home);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setWorkbenchUserHomeOverride(null);
  for (const dir of listExternalTeamRoots()) unregisterExternalTeamRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setTeamsInstalledDataDir(null);
  setAppTeamsStateDataDir(null);
  __resetTeamsResolverForTests();
});

/** Seal the app-level installed store into a per-test temp dir. */
function sealAppStore(): string {
  const dir = makeTempDir("packs-app-");
  setTeamsInstalledDataDir(dir);
  setAppTeamsStateDataDir(dir);
  tempDirs.push(dir);
  return dir;
}

describe("skills-sync: 列表与启停（resolver 接管，§5.6.2）", () => {
  it("lists user skills from the workbench hangar", () => {
    const root = temp();
    writeLocalSkill("citations");

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].fqid).toBe(`${MY_CONTENT_TEAM_ID}:citations`);
    expect(skills[0].name).toBe("citations");
    expect(skills[0].enabled).toBe(true);
    expect(skills[0].origin).toBe("custom");
    expect(skills[0].removable).toBe(true);
    expect(skills[0].skillDirRel).toBe(`${HOME_SKILLS_DIRNAME}/citations`);
  });

  it("does not migrate leftover paper-side skills into the hangar", () => {
    const root = temp();
    const legacyDir = join(root, ".prismnext/agent/skills/citations");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      join(legacyDir, "SKILL.md"),
      "---\nname: citations\ndescription: d\n---\n# citations\n",
      "utf-8",
    );

    const skills = listProjectSkills(root);
    expect(skills.filter((s) => s.id === "citations")).toHaveLength(0);
    expect(existsSync(join(homeSkillsDir(), "citations", "SKILL.md"))).toBe(false);
  });

  it("setSkillContentEnabled toggles via workbench teams-state (FQID + bare id)", () => {
    const root = temp();
    writeLocalSkill("citations");

    const fqid = setSkillContentEnabled(root, "citations", false);
    expect(fqid).toBe(`${MY_CONTENT_TEAM_ID}:citations`);
    expect(listProjectSkills(root)[0].enabled).toBe(false);

    setSkillContentEnabled(root, `${MY_CONTENT_TEAM_ID}:citations`, true);
    expect(listProjectSkills(root)[0].enabled).toBe(true);
  });

  it("computeProfileSkillDisabled denies only inactive names (shadow carve-out)", () => {
    const root = temp();
    writeLocalSkill("academic-citations");
    writeLocalSkill("peer-review-response");
    writeLocalSkill("literature-review");
    setSkillContentEnabled(root, `${MY_CONTENT_TEAM_ID}:literature-review`, false);

    const disabled = computeProfileSkillDisabled(root, {
      teamId: MY_CONTENT_TEAM_ID,
    });
    expect(disabled).toEqual(["literature-review"]);
  });

  it("computeProfileSkillDisabled scopes auto-allow to active team roster", () => {
    const teamsRoot = temp("packs-root-");
    makePack(teamsRoot, "acme.foreign", baseManifest("acme.foreign"), {
      skills: [{ id: "foreign-skill" }],
      orchestrators: [{ id: "lead" }],
    });
    registerExternalTeamRoot(teamsRoot, "bundled");
    sealAppStore();
    addInstalledTeam("acme.foreign");

    const root = temp();
    writeLocalSkill("local-skill");

    const scoped = computeProfileSkillDisabled(root, {
      teamId: MY_CONTENT_TEAM_ID,
    });
    expect(scoped).toContain("foreign-skill");
    expect(scoped).not.toContain("local-skill");

    const withSlash = computeProfileSkillDisabled(root, {
      teamId: MY_CONTENT_TEAM_ID,
      extraAllowIds: ["foreign-skill"],
    });
    expect(withSlash).not.toContain("foreign-skill");
  });
});

describe("skills-sync: OpenCode 集成路径（引用模型）", () => {
  it("sync emits the local scan entry and does not create a paper-side hangar", () => {
    const root = temp();
    const result = syncProjectSkillsIntegration(root);

    expect(result.skillsPaths).toEqual([PRISM_OPENCODE_SKILLS_SCAN_REL]);
    expect(existsSync(join(root, ".opencode/opencode.json"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills"))).toBe(false);
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(false);
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(false);
    expect(existsSync(homeSkillsDir())).toBe(true);
  });

  it("skills scan entry covers SKILL.md at any depth (OpenCode semantics)", () => {
    expect(PRISM_OPENCODE_SKILLS_SCAN_REL).toBe(".workbench/agent");
  });

  it("skillsPaths: pack dirs（非 core 字典序 → core）→ local 扫描位最后", () => {
    const teamsRoot = temp("packs-root-");
    makePack(teamsRoot, "aaa.pack", baseManifest("aaa.pack"), {
      skills: [{ id: "skill-a" }],
    });
    makePack(teamsRoot, CORE_TEAM_ID, baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
      skills: [{ id: "skill-core" }],
    });
    // bundled source so the reserved core id is accepted (design: reserved-id guard).
    registerExternalTeamRoot(teamsRoot, "bundled");

    const root = temp();
    sealAppStore();
    addInstalledTeam("aaa.pack");

    const result = syncProjectSkillsIntegration(root);
    // §7.5 rank descending (later-wins): core (rank 5, weakest) first, then
    // bundled aaa.pack (rank 4), project scan entry last (strongest).
    expect(result.skillsPaths).toEqual([
      join(teamsRoot, CORE_TEAM_ID).replace(/\\/g, "/"),
      join(teamsRoot, "aaa.pack").replace(/\\/g, "/"),
      PRISM_OPENCODE_SKILLS_SCAN_REL,
    ]);
  });

  it("pack 级禁用 → 目录整体移出 paths；团队 roster 再收紧 permission.skill", () => {
    const teamsRoot = temp("packs-root-");
    makePack(teamsRoot, "aaa.pack", baseManifest("aaa.pack"), {
      skills: [{ id: "shared" }, { id: "solo" }],
    });
    makePack(teamsRoot, CORE_TEAM_ID, baseManifest(CORE_TEAM_ID, { publisher: "prismnext" }), {
      skills: [{ id: "shared" }],
      orchestrators: [{ id: "build" }],
    });
    // bundled source so the reserved core id is accepted (reserved-id guard).
    registerExternalTeamRoot(teamsRoot, "bundled");

    const root = temp();
    sealAppStore();
    addInstalledTeam("aaa.pack");

    // pack.a 整包禁用 → 目录出 paths；solo 无激活实例 → deny
    setAppTeamEnabled("aaa.pack", false);
    let result = syncProjectSkillsIntegration(root, { teamId: CORE_TEAM_ID });
    expect(result.skillsPaths).toEqual([
      join(teamsRoot, CORE_TEAM_ID).replace(/\\/g, "/"),
      PRISM_OPENCODE_SKILLS_SCAN_REL,
    ]);
    expect(result.skillPermissions["solo"]).toBe("deny");
    // Active team = core → own-team shared stays allowed (shadow carve-out).
    expect(result.skillPermissions["shared"]).toBeUndefined();

    // Under project.local, core's shared is out of roster → deny (slash can re-allow).
    result = syncProjectSkillsIntegration(root, { teamId: PROJECT_DEFAULT_TEAM_ID });
    expect(result.skillPermissions["shared"]).toBe("deny");

    // core 的 shared 也被逐项禁用 → 无激活实例 → deny
    setAppAssetEnabled(`${CORE_TEAM_ID}:shared`, false);
    result = syncProjectSkillsIntegration(root, { teamId: CORE_TEAM_ID });
    expect(result.skillPermissions["shared"]).toBe("deny");
  });

  it("detects skills integration paths (home hangar + workbench hangar)", () => {
    const root = temp();
    const homeSkillMd = join(homeSkillDir("demo"), "SKILL.md");
    const localSkillMd = join(root, PRISM_LOCAL_SKILLS_REL, "demo/SKILL.md");
    const leftoverSkillMd = join(root, ".prismnext/agent/skills/demo/SKILL.md");
    expect(isSkillsIntegrationPath(homeSkillMd, root)).toBe(true);
    expect(isSkillsIntegrationPath(localSkillMd.replace(/\//g, "\\"), root)).toBe(true);
    expect(isSkillsIntegrationPath(leftoverSkillMd.replace(/\//g, "\\"), root)).toBe(false);
    expect(isSkillsIntegrationPath(join(root, "main.tex"), root)).toBe(false);
    expect(
      isSkillsIntegrationPath(join(root, ".workbench/agent/teams/project.local/experts/x/expert.json"), root),
    ).toBe(false);
    expect(
      isSkillsIntegrationPath(join(root, ".workbench/agent/AGENTS.md"), root),
    ).toBe(false);
  });

  it("resolves project root from agent path on Windows-style separators", () => {
    const abs = "C:/Users/test/project/.workbench/agent/teams/project.local/skills/x/SKILL.md";
    expect(projectRootFromAgentPath(abs)).toBe("C:/Users/test/project");
    const backslash = "C:\\Users\\test\\project\\.workbench\\agent\\teams\\project.local\\skills\\x\\SKILL.md";
    expect(projectRootFromAgentPath(backslash)).toBe("C:/Users/test/project");
  });
});

describe("skills-sync: 权限映射（纯函数，不变）", () => {
  it("sanitizeSkillPermissionMap never spreads string allow into numeric keys", () => {
    const corrupted = sanitizeSkillPermissionMap("allow", { "customize-opencode": "deny" });
    expect(corrupted).toEqual({ "*": "allow", "customize-opencode": "deny" });
    expect(corrupted["0"]).toBeUndefined();

    const repaired = sanitizeSkillPermissionMap(
      { "0": "a", "1": "l", "*": "allow", "customize-opencode": "deny" },
      {},
    );
    expect(repaired).toEqual({ "*": "allow" });
    expect(skillPermissionNeedsRepair(repaired)).toBe(false);
    expect(skillPermissionNeedsRepair({ "0": "a", "1": "l" })).toBe(true);
  });

  it("sanitizeSkillPermissionMap drops stale per-skill denies not in patch", () => {
    const cleaned = sanitizeSkillPermissionMap(
      { "*": "allow", "peer-review-response": "deny", "academic-citations": "deny" },
      { "customize-opencode": "deny" },
    );
    expect(cleaned).toEqual({ "*": "allow", "customize-opencode": "deny" });
    expect(cleaned["peer-review-response"]).toBeUndefined();
    expect(cleaned["academic-citations"]).toBeUndefined();
  });

  it("buildSkillPermissions denies disabled skills and hides customize-opencode", () => {
    const perms = buildSkillPermissions(["old-skill"]);
    expect(perms["old-skill"]).toBe("deny");
    for (const hidden of OPENCODE_HIDDEN_SKILLS) {
      expect(perms[hidden]).toBe("deny");
    }
    expect(perms["*"]).toBe("allow");
  });
});

describe("skills-sync: 项目清理与 gitignore（不变）", () => {
  it("removes project-root and nested OpenCode/agent artifact dirs", () => {
    const root = temp();
    mkdirSync(join(root, ".opencode"), { recursive: true });
    mkdirSync(join(root, ".agents/skills"), { recursive: true });
    mkdirSync(join(root, ".prismnext/.opencode"), { recursive: true });
    mkdirSync(join(root, ".prismnext/opencode"), { recursive: true });
    writeFileSync(
      join(root, ".opencode/opencode.json"),
      JSON.stringify({
        skills: { paths: [".prismnext/agent/skills"], urls: ["https://old.example/index.json"] },
      }),
      "utf-8",
    );
    syncProjectSkillsIntegration(root);
    expect(existsSync(join(root, ".opencode"))).toBe(false);
    expect(existsSync(join(root, ".agents"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/opencode"))).toBe(false);
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(false);
  });

  it("appends opencode artifact lines to project .gitignore", () => {
    const root = temp();
    mkdirSync(join(root, ".git"));
    writeFileSync(join(root, ".gitignore"), "node_modules/\n", "utf-8");
    syncProjectSkillsIntegration(root);
    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".opencode/");
    expect(gitignore).toContain(".agents/");
  });

  it("normalizes accidental .prismnext project roots before syncing", () => {
    const root = temp();
    mkdirSync(join(root, ".prismnext/.opencode"), { recursive: true });
    writeFileSync(join(root, ".prismnext/.opencode/opencode.json"), "{}", "utf-8");

    syncProjectSkillsIntegration(join(root, ".prismnext"));

    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/.prismnext"))).toBe(false);
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(false);
    expect(existsSync(join(root, ".opencode"))).toBe(false);
  });
});

describe("skills-sync: 技能库来源（manifest 元数据，不变）", () => {
  function mockRegistryFetch(indexUrl: string, skillCount = 1) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === indexUrl || url.includes("index.json")) {
          return new Response(
            JSON.stringify({
              skills: Array.from({ length: skillCount }, (_, i) => ({
                name: `skill-${i + 1}`,
                description: "Test skill",
                type: "skill-md",
                url: "/skill.md",
              })),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("", { status: 404 });
      }),
    );
  }

  it("does not seed prism-curated as an install library (Core ≠ curated)", () => {
    const root = temp();
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID)).toBe(false);
  });

  it("strips legacy prism-curated bundled source from manifests", () => {
    const root = temp();
    mkdirSync(join(homeSkillsManifestPath(), ".."), { recursive: true });
    writeFileSync(
      homeSkillsManifestPath(),
      JSON.stringify({
        sources: [
          { id: PRISM_CURATED_SOURCE_ID, kind: "bundled", connected: true },
          {
            id: "remote:https://example.com/index.json",
            kind: "remote",
            url: "https://example.com/index.json",
            connected: true,
          },
        ],
      }),
    );
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID)).toBe(false);
    expect(sources.some((s) => s.url === "https://example.com/index.json")).toBe(true);
  });

  it("does not write library registry URLs to skills patch", async () => {
    const root = temp();
    const registryUrl = "https://agentskills.io/.well-known/agent-skills/index.json";
    mockRegistryFetch(registryUrl);
    await addSkillLibrarySource(root, registryUrl);
    const result = syncProjectSkillsIntegration(root);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(true);
  });

  it("uses preset display names for known registry URLs in manifest", async () => {
    const root = temp();
    const registryUrl = "https://developers.cloudflare.com/.well-known/agent-skills/index.json";
    mockRegistryFetch(registryUrl, 2);
    await addSkillLibrarySource(root, registryUrl);
    const source = listLibrarySources(root).find((s) => s.url === registryUrl);
    expect(source?.name).toBe("Cloudflare Docs");
    expect(source?.description).toContain("Cloudflare");
  });

  it("remove deletes remote source from manifest", async () => {
    const root = temp();
    const registryUrl = "https://example.com/.well-known/agent-skills/index.json";
    mockRegistryFetch(registryUrl);
    await addSkillLibrarySource(root, registryUrl);
    const source = listLibrarySources(root).find((s) => s.url === registryUrl)!;
    removeSkillLibrarySource(root, source.id);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(false);
  });

  it("migrates legacy registryUrls to sources", () => {
    const root = temp();
    mkdirSync(join(homeSkillsManifestPath(), ".."), { recursive: true });
    writeFileSync(
      homeSkillsManifestPath(),
      JSON.stringify({
        registryUrls: ["https://legacy.example/.well-known/agent-skills/index.json"],
      }),
      "utf-8",
    );
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.url?.includes("legacy.example"))).toBe(true);
  });

  it("readSkillsManifest still parses legacy disabled (R10 migration input)", () => {
    const root = temp();
    writeSkillsManifest(root, { disabled: ["old-skill"], sources: undefined, installs: [] });
    const manifest = readSkillsManifest(root);
    expect(manifest.disabled).toEqual(["old-skill"]);
  });
});
