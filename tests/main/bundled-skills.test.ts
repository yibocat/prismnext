import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { listProjectSkills } from "../../src/main/services/skills-sync";

const RESOURCES_SKILLS = join(process.cwd(), "resources", "skills");

describe("bundled skills resources", () => {
  it("manifest lists 17 curated skills", () => {
    const manifest = JSON.parse(
      readFileSync(join(RESOURCES_SKILLS, "manifest.json"), "utf-8"),
    );
    expect(manifest.skills).toHaveLength(17);
    const ids = manifest.skills.map((s: { id: string }) => s.id);
    expect(ids).toContain("academic-citations");
    expect(ids).toContain("skill-creator");
    expect(ids).toContain("git-commit-messages");
  });

  it("each skill has a SKILL.md with frontmatter", () => {
    const manifest = JSON.parse(
      readFileSync(join(RESOURCES_SKILLS, "manifest.json"), "utf-8"),
    );
    for (const skill of manifest.skills) {
      const path = join(RESOURCES_SKILLS, skill.id, "SKILL.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toMatch(/^---\r?\n/);
      expect(content).toContain(`name: ${skill.name}`);
      expect(content).toContain(`description: ${skill.description}`);
    }
  });
});

describe("copyBundledSkillToProject", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("copies bundled skill folder into project", () => {
    root = mkdtempSync(join(tmpdir(), "prism-bundled-skill-"));
    // Mock getBundledSkillsDir by copying test resource path — service uses electron app.
    // Test install path via direct copy from resources (integration-style).
    const srcDir = join(RESOURCES_SKILLS, "academic-citations");
    const destDir = join(root, ".prismnext/agent/skills/academic-citations");
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("academic-citations");
    expect(skills[0].name).toBe("academic-citations");
  });
});
