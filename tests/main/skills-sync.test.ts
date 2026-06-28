import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  listProjectSkills,
  readSkillsManifest,
  syncProjectSkillsIntegration,
  writeSkillsManifest,
  addSkillLibrarySource,
  removeSkillLibrarySource,
  setSkillLibrarySourceConnected,
  listLibrarySources,
  PRISM_CURATED_SOURCE_ID,
  OPENCODE_HIDDEN_SKILLS,
  PRISM_OPENCODE_SKILLS_SCAN_REL,
  buildSkillPermissions,
  computeProfileSkillDisabled,
  sanitizeSkillPermissionMap,
  skillPermissionNeedsRepair,
  sanitizeSkillPermissionMap,
  isSkillsIntegrationPath,
  projectRootFromAgentPath,
} from "../../src/main/services/skills-sync";

describe("skills-sync", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("lists skills from subdirectories with SKILL.md", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const skillDir = join(root, ".prismnext/agent/skills/citations");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---
name: citations
description: Manage BibTeX citations
---
# Citations
`,
      "utf-8",
    );

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("citations");
    expect(skills[0].enabled).toBe(true);
  });

  it("sync returns relative skills scan path and does not write project-root opencode.json", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const result = syncProjectSkillsIntegration(root);

    expect(result.skillsPaths).toEqual([PRISM_OPENCODE_SKILLS_SCAN_REL]);
    expect(existsSync(join(root, ".opencode/opencode.json"))).toBe(false);
    expect(existsSync(join(root, ".agents/skills"))).toBe(false);
  });

  it("skills scan path is parent of skills/ for OpenCode glob", () => {
    expect(PRISM_OPENCODE_SKILLS_SCAN_REL).toBe(".prismnext/agent");
  });

  it("detects skills integration paths cross-platform", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const skillMd = join(root, ".prismnext/agent/skills/demo/SKILL.md");
    const manifest = join(root, ".prismnext/agent/skills-manifest.json");
    const winSkillMd = skillMd.replace(/\//g, "\\");
    expect(isSkillsIntegrationPath(winSkillMd, root)).toBe(true);
    expect(isSkillsIntegrationPath(manifest.replace(/\//g, "\\"), root)).toBe(true);
    expect(isSkillsIntegrationPath(join(root, "main.tex"), root)).toBe(false);
  });

  it("resolves project root from agent path on Windows-style separators", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const abs = "C:/Users/test/project/.prismnext/agent/skills/x/SKILL.md";
    expect(projectRootFromAgentPath(abs)).toBe("C:/Users/test/project");
    const backslash = "C:\\Users\\test\\project\\.prismnext\\agent\\skills\\x\\SKILL.md";
    expect(projectRootFromAgentPath(backslash)).toBe("C:/Users/test/project");
  });

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

  it("computeProfileSkillDisabled does NOT deny skills outside the profile whitelist", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    for (const id of ["academic-citations", "peer-review-response", "literature-review"]) {
      const dir = join(root, `.prismnext/agent/skills/${id}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `---
name: ${id}
description: ${id}
---
# ${id}`,
        "utf-8",
      );
    }
    writeSkillsManifest(root, { disabled: ["literature-review"] });

    // Profile whitelists only academic-citations, but the other installed
    // skills must NOT be denied — only the manifest-disabled one is.
    const disabled = computeProfileSkillDisabled(root, ["academic-citations"]);
    expect(disabled).toEqual(["literature-review"]);
    expect(disabled).not.toContain("peer-review-response");
    expect(disabled).not.toContain("academic-citations");
  });

  it("always includes prism-curated bundled source", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID && s.kind === "bundled")).toBe(true);
  });

  it("does not write library registry URLs to skills patch", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const registryUrl = "https://agentskills.io/.well-known/agent-skills/index.json";
    addSkillLibrarySource(root, registryUrl);
    const result = syncProjectSkillsIntegration(root);
    expect(result.registryUrls).toEqual([]);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(true);
  });

  it("removes project-root and nested OpenCode/agent artifact dirs", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
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
    writeFileSync(
      join(root, ".prismnext/.opencode/opencode.json"),
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
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(true);
  });

  it("appends opencode artifact lines to project .gitignore", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    syncProjectSkillsIntegration(root);
    const gitignore = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(gitignore).toContain(".opencode/");
    expect(gitignore).toContain(".agents/");
  });

  it("normalizes accidental .prismnext project roots before syncing", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    mkdirSync(join(root, ".prismnext/.opencode"), { recursive: true });
    writeFileSync(join(root, ".prismnext/.opencode/opencode.json"), "{}", "utf-8");

    syncProjectSkillsIntegration(join(root, ".prismnext"));

    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/.prismnext"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(true);
    expect(existsSync(join(root, ".opencode"))).toBe(false);
  });

  it("remove deletes remote source from manifest", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const registryUrl = "https://example.com/.well-known/agent-skills/index.json";
    addSkillLibrarySource(root, registryUrl);
    const source = listLibrarySources(root).find((s) => s.url === registryUrl)!;
    removeSkillLibrarySource(root, source.id);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(false);
  });

  it("cannot remove built-in prism-curated source", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    expect(() => removeSkillLibrarySource(root, PRISM_CURATED_SOURCE_ID)).toThrow(/cannot be removed/i);
    expect(listLibrarySources(root).some((s) => s.id === PRISM_CURATED_SOURCE_ID)).toBe(true);
  });

  it("migrates legacy registryUrls to sources", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
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
});
