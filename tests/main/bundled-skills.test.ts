import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { listProjectSkills } from "../../src/main/services/skills-sync";

const RESOURCES_SKILLS = join(process.cwd(), "resources", "skills");

describe("bundled skills resources", () => {
  it("manifest lists 29 curated skills", () => {
    const manifest = JSON.parse(
      readFileSync(join(RESOURCES_SKILLS, "manifest.json"), "utf-8"),
    );
    expect(manifest.skills).toHaveLength(29);
    const ids = manifest.skills.map((s: { id: string }) => s.id);
    expect(ids).toContain("idea-lab");
    expect(ids).toContain("writing-related-work");
    expect(ids).toContain("writing-design");
    expect(ids).toContain("writing-introduction");
    expect(ids).toContain("writing-methods");
    expect(ids).toContain("writing-results");
    expect(ids).toContain("writing-conclusion");
    expect(ids).toContain("writing-preliminaries");
    expect(ids).toContain("skill-creator");
    expect(ids).toContain("manuscript-preflight");
    expect(ids).toContain("statistical-rigor");
    expect(ids).toContain("prisma-systematic-review");
    expect(ids).toContain("figure-matplotlib");
    expect(ids).toContain("figure-observable-plot");
    expect(ids).toContain("symbolic-math");
    expect(ids).toContain("math-numeric");
    expect(ids).toContain("math-manifold");
    expect(ids).toContain("math-lattice");
    expect(ids).toContain("figure-tikz");
    expect(ids).toContain("ml-research-protocol");
    expect(ids).toContain("management-science-empirical");
    expect(ids).toContain("figure-interaction");
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
    const srcDir = join(RESOURCES_SKILLS, "writing-related-work");
    const destDir = join(root, ".prismnext/agent/skills/writing-related-work");
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });

    const skills = listProjectSkills(root);
    expect(skills).toHaveLength(1);
    expect(skills[0].id).toBe("writing-related-work");
    expect(skills[0].name).toBe("writing-related-work");
    // writing-related-work is a bundled skill id — origin resolves via the
    // repo resources fallback (no electron app in vitest).
    expect(skills[0].origin).toBe("bundled");
  });
});
