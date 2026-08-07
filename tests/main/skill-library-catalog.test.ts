import { describe, expect, it, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { copyBundledSkillToProject, listBundledSkills } from "../../src/main/services/bundled-skills";
import {
  installAllFromLibrarySource,
  uninstallAllFromLibrarySource,
} from "../../src/main/services/skill-library-catalog";
import { listProjectSkills, PRISM_CURATED_SOURCE_ID } from "../../src/main/services/skills-sync";

describe("skill-library-catalog bundled batch", () => {
  let root: string;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it("installAllFromLibrarySource copies every bundled skill", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-skill-batch-"));
    const bundled = listBundledSkills();
    expect(bundled.length).toBeGreaterThan(0);

    const { installedIds } = await installAllFromLibrarySource(root, PRISM_CURATED_SOURCE_ID);
    expect(installedIds).toEqual(bundled.map((s) => s.id));

    const installed = listProjectSkills(root);
    expect(installed.map((s) => s.id).sort()).toEqual(bundled.map((s) => s.id).sort());
    for (const skill of bundled) {
      expect(existsSync(join(root, ".prismnext", "agent", "skills", skill.id, "SKILL.md"))).toBe(
        true,
      );
    }
  });

  it("uninstallAllFromLibrarySource removes only bundled skills", async () => {
    root = mkdtempSync(join(tmpdir(), "prism-skill-batch-"));
    const bundled = listBundledSkills();
    const first = bundled[0]!;
    copyBundledSkillToProject(root, first.id);

    const customDir = join(root, ".prismnext", "agent", "skills", "my-custom-skill");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(customDir, { recursive: true });
    writeFileSync(
      join(customDir, "SKILL.md"),
      "---\nname: my-custom-skill\ndescription: test\n---\n\nbody\n",
      "utf-8",
    );

    expect(listProjectSkills(root).map((s) => s.id).sort()).toEqual(
      [first.id, "my-custom-skill"].sort(),
    );

    const { removedIds } = await uninstallAllFromLibrarySource(root, PRISM_CURATED_SOURCE_ID);
    expect(removedIds).toEqual([first.id]);
    expect(listProjectSkills(root).map((s) => s.id)).toEqual(["my-custom-skill"]);
    expect(existsSync(join(customDir, "SKILL.md"))).toBe(true);
  });
});
