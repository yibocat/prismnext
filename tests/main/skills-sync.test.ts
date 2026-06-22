import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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

  it("sync does not create OpenCode project artifacts", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const result = syncProjectSkillsIntegration(root);
    expect(result.configPath).toBe("");
    expect(existsSync(join(root, ".opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(true);
  });

  it("keeps disabled skills in Prism manifest only", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    writeSkillsManifest(root, { disabled: ["old-skill"] });
    syncProjectSkillsIntegration(root);
    const manifest = readSkillsManifest(root);
    expect(manifest.disabled).toContain("old-skill");
    expect(existsSync(join(root, ".opencode"))).toBe(false);
  });

  it("always includes prism-curated bundled source", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const sources = listLibrarySources(root);
    expect(sources.some((s) => s.id === PRISM_CURATED_SOURCE_ID && s.kind === "bundled")).toBe(true);
  });

  it("does not write library sources to OpenCode project config", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    const registryUrl = "https://agentskills.io/.well-known/agent-skills/index.json";
    addSkillLibrarySource(root, registryUrl);
    syncProjectSkillsIntegration(root);
    expect(existsSync(join(root, ".opencode"))).toBe(false);
    expect(listLibrarySources(root).some((s) => s.url === registryUrl)).toBe(true);
  });

  it("removes legacy OpenCode project artifacts on sync", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    mkdirSync(join(root, ".opencode"), { recursive: true });
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
    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/opencode"))).toBe(false);
  });

  it("normalizes accidental .prismnext project roots before syncing", () => {
    root = mkdtempSync(join(tmpdir(), "prism-skills-"));
    mkdirSync(join(root, ".prismnext/.opencode"), { recursive: true });
    writeFileSync(join(root, ".prismnext/.opencode/opencode.json"), "{}", "utf-8");

    syncProjectSkillsIntegration(join(root, ".prismnext"));

    expect(existsSync(join(root, ".prismnext/.opencode"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/.prismnext"))).toBe(false);
    expect(existsSync(join(root, ".prismnext/agent/skills"))).toBe(true);
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
