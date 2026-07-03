import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";
import {
  githubSourceToAnalyzeUrl,
  parseGitHubInput,
  scanSkillPackagesAtRoot,
} from "../../src/main/services/skill-install-github";

describe("skill-install-github", () => {
  it("builds analyze URLs that parse back to the same repo ref", () => {
    const cases = [
      { repo: "Yuan1z0825/nature-skills", ref: "main" as const },
      { repo: "Yuan1z0825/nature-skills", ref: "develop" as const },
      {
        repo: "Yuan1z0825/nature-skills",
        ref: "main" as const,
        subPath: "skills/nature-reader",
      },
    ];

    for (const source of cases) {
      const url = githubSourceToAnalyzeUrl(source);
      expect(url).not.toContain("@");
      const parsed = parseGitHubInput(url);
      expect(parsed).toEqual({
        owner: "Yuan1z0825",
        repo: "nature-skills",
        ref: source.ref,
        subPath: source.subPath ?? "",
      });
    }
  });

  it("parses GitHub repo URLs", () => {
    expect(parseGitHubInput("Yuan1z0825/nature-skills")).toEqual({
      owner: "Yuan1z0825",
      repo: "nature-skills",
      ref: "main",
      subPath: "",
    });
    expect(parseGitHubInput("https://github.com/Yuan1z0825/nature-skills")).toEqual({
      owner: "Yuan1z0825",
      repo: "nature-skills",
      ref: "main",
      subPath: "",
    });
    expect(
      parseGitHubInput("https://github.com/Yuan1z0825/nature-skills/tree/main/skills/nature-reader"),
    ).toEqual({
      owner: "Yuan1z0825",
      repo: "nature-skills",
      ref: "main",
      subPath: "skills/nature-reader",
    });
  });

  describe("scanSkillPackagesAtRoot", () => {
    let root: string;

    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true });
    });

    it("finds skills/ layout with shared bundle", () => {
      root = mkdtempSync(join(tmpdir(), "prism-github-scan-"));
      mkdirSync(join(root, "skills", "_shared"), { recursive: true });
      writeFileSync(join(root, "skills", "_shared", "notes.md"), "# shared\n", "utf-8");
      mkdirSync(join(root, "skills", "demo-skill"), { recursive: true });
      writeFileSync(
        join(root, "skills", "demo-skill", "SKILL.md"),
        `---
name: demo-skill
description: Demo package
---
# Demo
`,
        "utf-8",
      );

      const { packages, sharedBundle } = scanSkillPackagesAtRoot(root, root);
      expect(packages).toHaveLength(1);
      expect(packages[0].id).toBe("demo-skill");
      expect(sharedBundle?.path).toBe("skills/_shared");
    });

    it("finds a single skill when scan root contains SKILL.md", () => {
      root = mkdtempSync(join(tmpdir(), "prism-github-scan-"));
      mkdirSync(join(root, "skills", "solo"), { recursive: true });
      writeFileSync(
        join(root, "skills", "solo", "SKILL.md"),
        `---
name: solo
description: Single skill folder
---
`,
        "utf-8",
      );

      const scanRoot = join(root, "skills", "solo");
      const { packages } = scanSkillPackagesAtRoot(root, scanRoot);
      expect(packages).toHaveLength(1);
      expect(packages[0].id).toBe("solo");
    });
  });
});
