import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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
  PROJECT_OPENCODE_REL,
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

  it("sync writes skills.paths to project opencode.json", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    syncProjectSkillsIntegration(root);
    const config = JSON.parse(readFileSync(join(root, PROJECT_OPENCODE_REL), "utf-8"));
    expect(config.skills.paths).toContain(".prismnext/agent/skills");
    expect(config.permission.skill["*"]).toBe("allow");
    expect(config.permission.skill["customize-opencode"]).toBe("deny");
  });

  it("marks disabled skills in manifest and permission", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    writeSkillsManifest(root, { disabled: ["old-skill"] });
    syncProjectSkillsIntegration(root);
    const manifest = readSkillsManifest(root);
    expect(manifest.disabled).toContain("old-skill");
    const config = JSON.parse(readFileSync(join(root, PROJECT_OPENCODE_REL), "utf-8"));
    expect(config.permission.skill["old-skill"]).toBe("deny");
  });

  it("always includes prism-curated bundled source", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID && s.kind === "bundled")).toBe(true);
  });

  it("does not write library sources to opencode skills.urls", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const registryUrl = "https://agentskills.io/.well-known/agent-skills/index.json";
    addSkillLibrarySource(root, registryUrl);
    syncProjectSkillsIntegration(root);
    const config = JSON.parse(readFileSync(join(root, PROJECT_OPENCODE_REL), "utf-8"));
    expect(config.skills.paths).toContain(".prismnext/agent/skills");
    expect(config.skills.urls ?? []).toHaveLength(0);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(true);
  });

  it("clears legacy skills.urls on sync", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    mkdirSync(join(root, ".opencode"), { recursive: true });
    writeFileSync(
      join(root, PROJECT_OPENCODE_REL),
      JSON.stringify({
        skills: { paths: [".prismnext/agent/skills"], urls: ["https://old.example/index.json"] },
      }),
      "utf-8",
    );
    syncProjectSkillsIntegration(root);
    const config = JSON.parse(readFileSync(join(root, PROJECT_OPENCODE_REL), "utf-8"));
    expect(config.skills.urls).toEqual([]);
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
