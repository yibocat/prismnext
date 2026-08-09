import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach, vi } from "vitest";
import {
  listProjectSkills,
  readSkillsManifest,
  syncProjectSkillsIntegration,
  writeSkillsManifest,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  setSkillLibrarySourceConnected,
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
  listExternalPackRoots,
  registerExternalPackRoot,
  unregisterExternalPackRoot,
} from "../../src/main/services/pack-catalog";
import {
  readPacksState,
  setContentDisabled,
  setPackEnabled,
} from "../../src/main/services/packs-state";
import {
  addInstalledPack,
  setPacksInstalledDataDir,
} from "../../src/main/services/packs-installed";
import { CORE_PACK_ID } from "../../src/shared/packs/types";
import { baseManifest, makePack, makeTempDir } from "./packs-test-utils";

const tempDirs: string[] = [];

function temp(prefix = "prism-skills-"): string {
  const dir = makeTempDir(prefix);
  tempDirs.push(dir);
  return dir;
}

function writeLocalSkill(root: string, id: string, extra = ""): void {
  const dir = join(root, PRISM_LOCAL_SKILLS_REL, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${id} desc\n---\n${extra}\n# ${id}\n`,
    "utf-8",
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of listExternalPackRoots()) unregisterExternalPackRoot(dir);
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  setPacksInstalledDataDir(null);
});

/** Seal the app-level installed store into a per-test temp dir. */
function sealAppStore(): string {
  const dir = makeTempDir("packs-app-");
  setPacksInstalledDataDir(dir);
  tempDirs.push(dir);
  return dir;
}

describe("skills-sync: 列表与启停（resolver 接管，§5.6.2）", () => {
  it("lists local skills from the Local Pack", () => {
    const root = temp();
    writeLocalSkill(root, "citations");

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].fqid).toBe("user.local:citations");
    expect(skills[0].name).toBe("citations");
    expect(skills[0].enabled).toBe(true);
    expect(skills[0].origin).toBe("custom");
    expect(skills[0].removable).toBe(true);
    expect(skills[0].skillDirRel).toBe(`${PRISM_LOCAL_SKILLS_REL}/citations`);
  });

  it("legacy .prismnext/agent/skills migrates into the Local Pack on read (R6)", () => {
    const root = temp();
    const legacyDir = join(root, ".prismnext/agent/skills/citations");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      join(legacyDir, "SKILL.md"),
      "---\nname: citations\ndescription: d\n---\n# citations\n",
      "utf-8",
    );

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].fqid).toBe("user.local:citations");
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(false);
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL, "citations", "SKILL.md"))).toBe(true);
  });

  it("setSkillContentEnabled toggles via packs.json disabledContent (FQID + bare id)", () => {
    const root = temp();
    writeLocalSkill(root, "citations");

    // 裸 id 解析（唯一匹配 → local）
    const fqid = setSkillContentEnabled(root, "citations", false);
    expect(fqid).toBe("user.local:citations");
    expect(readPacksState(root).disabledContent).toContain("user.local:citations");
    expect(listProjectSkills(root)[0].enabled).toBe(false);

    setSkillContentEnabled(root, "user.local:citations", true);
    expect(readPacksState(root).disabledContent).not.toContain("user.local:citations");
    expect(listProjectSkills(root)[0].enabled).toBe(true);
  });

  it("computeProfileSkillDisabled denies only inactive names (shadow carve-out)", () => {
    const root = temp();
    writeLocalSkill(root, "academic-citations");
    writeLocalSkill(root, "peer-review-response");
    writeLocalSkill(root, "literature-review");
    setSkillContentEnabled(root, "user.local:literature-review", false);

    // Profile whitelists only academic-citations, but the other installed
    // skills must NOT be denied — only the disabled one is.
    const disabled = computeProfileSkillDisabled(root, ["academic-citations"]);
    expect(disabled).toEqual(["literature-review"]);
  });
});

describe("skills-sync: OpenCode 集成路径（引用模型）", () => {
  it("sync emits the local scan entry and creates the Local Pack skills dir", () => {
    const root = temp();
    const result = syncProjectSkillsIntegration(root);

    expect(result.skillsPaths).toEqual([PRISM_OPENCODE_SKILLS_SCAN_REL]);
    expect(existsSync(join(root, ".opencode/opencode.json"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills"))).toBe(false);
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(true);
    // legacy skills 目录不再被创建
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(false);
  });

  it("skills scan entry covers SKILL.md at any depth (OpenCode semantics)", () => {
    expect(PRISM_OPENCODE_SKILLS_SCAN_REL).toBe(".prismnext/agent");
  });

  it("skillsPaths: pack dirs（非 core 字典序 → core）→ local 扫描位最后", () => {
    const packsRoot = temp("packs-root-");
    makePack(packsRoot, "aaa.pack", baseManifest("aaa.pack"), {
      skills: [{ id: "skill-a" }],
    });
    makePack(packsRoot, CORE_PACK_ID, baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
      skills: [{ id: "skill-core" }],
    });
    registerExternalPackRoot(packsRoot);

    const root = temp();
    sealAppStore();
    addInstalledPack("aaa.pack");

    const result = syncProjectSkillsIntegration(root);
    expect(result.skillsPaths).toEqual([
      join(packsRoot, "aaa.pack").replace(/\\/g, "/"),
      join(packsRoot, CORE_PACK_ID).replace(/\\/g, "/"),
      PRISM_OPENCODE_SKILLS_SCAN_REL,
    ]);
  });

  it("pack 级禁用 → 目录整体移出 paths；同名遮蔽豁免 deny", () => {
    const packsRoot = temp("packs-root-");
    makePack(packsRoot, "aaa.pack", baseManifest("aaa.pack"), {
      skills: [{ id: "shared" }, { id: "solo" }],
    });
    makePack(packsRoot, CORE_PACK_ID, baseManifest(CORE_PACK_ID, { publisher: "prismnext" }), {
      skills: [{ id: "shared" }],
    });
    registerExternalPackRoot(packsRoot);

    const root = temp();
    sealAppStore();
    addInstalledPack("aaa.pack");

    // pack.a 整包禁用 → 目录出 paths；shared 仍有 core 激活实例 → 不 deny；
    // solo 无激活实例 → deny
    setPackEnabled(root, "aaa.pack", false);
    let result = syncProjectSkillsIntegration(root);
    expect(result.skillsPaths).toEqual([
      join(packsRoot, CORE_PACK_ID).replace(/\\/g, "/"),
      PRISM_OPENCODE_SKILLS_SCAN_REL,
    ]);
    expect(result.skillPermissions["solo"]).toBe("deny");
    expect(result.skillPermissions["shared"]).toBeUndefined();

    // core 的 shared 也被逐项禁用 → 无激活实例 → deny
    setContentDisabled(root, `${CORE_PACK_ID}:shared`, true);
    result = syncProjectSkillsIntegration(root);
    expect(result.skillPermissions["shared"]).toBe("deny");
  });

  it("detects skills integration paths (local + legacy backstop + manifest)", () => {
    const root = temp();
    const localSkillMd = join(root, PRISM_LOCAL_SKILLS_REL, "demo/SKILL.md");
    const legacySkillMd = join(root, ".prismnext/agent/skills/demo/SKILL.md");
    const manifest = join(root, ".prismnext/agent/skills-manifest.json");
    expect(isSkillsIntegrationPath(localSkillMd.replace(/\//g, "\\"), root)).toBe(true);
    expect(isSkillsIntegrationPath(legacySkillMd.replace(/\//g, "\\"), root)).toBe(true);
    expect(isSkillsIntegrationPath(manifest.replace(/\//g, "\\"), root)).toBe(true);
    expect(isSkillsIntegrationPath(join(root, "main.tex"), root)).toBe(false);
    // local pack 的 experts 目录不触发 skills 刷新
    expect(
      isSkillsIntegrationPath(join(root, ".prismnext/agent/local/experts/x/expert.json"), root),
    ).toBe(false);
  });

  it("resolves project root from agent path on Windows-style separators", () => {
    const abs = "C:/Users/test/project/.prismnext/agent/skills/x/SKILL.md";
    expect(projectRootFromAgentPath(abs)).toBe("C:/Users/test/project");
    const backslash = "C:\\Users\\test\\project\\.prismnext\\agent\\skills\\x\\SKILL.md";
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
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(true);
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
    expect(existsSync(join(root, PRISM_LOCAL_SKILLS_REL))).toBe(true);
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

  it("always includes prism-curated bundled source", () => {
    const root = temp();
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID && s.kind === "bundled")).toBe(true);
  });

  it("does not write library registry URLs to skills patch", async () => {
    const root = temp();
    const registryUrl = "https://agentskills.io/.well-known/agent-skills/index.json";
    mockRegistryFetch(registryUrl);
    await addSkillLibrarySource(root, registryUrl);
    const result = syncProjectSkillsIntegration(root);
    expect(result.registryUrls).toEqual([]);
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

  it("cannot remove built-in prism-curated source", () => {
    const root = temp();
    expect(() => removeSkillLibrarySource(root, PRISM_CURATED_SOURCE_ID)).toThrow(/cannot be removed/i);
    expect(listLibrarySources(root).some((s) => s.id === PRISM_CURATED_SOURCE_ID)).toBe(true);
  });

  it("allows disconnecting and reconnecting bundled prism-curated source", () => {
    const root = temp();
    let sources = setSkillLibrarySourceConnected(root, PRISM_CURATED_SOURCE_ID, false);
    expect(sources.find((s) => s.id === PRISM_CURATED_SOURCE_ID)?.connected).toBe(false);
    sources = setSkillLibrarySourceConnected(root, PRISM_CURATED_SOURCE_ID, true);
    expect(sources.find((s) => s.id === PRISM_CURATED_SOURCE_ID)?.connected).toBe(true);
  });

  it("migrates legacy registryUrls to sources", () => {
    const root = temp();
    mkdirSync(join(root, ".prismnext/agent"), { recursive: true });
    writeFileSync(
      join(root, ".prismnext/agent/skills-manifest.json"),
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
