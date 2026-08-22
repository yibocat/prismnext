import { describe, expect, it } from "vitest";
import {
  formatAmbiguousSkillPath,
  isPathUnderSkillReadRoots,
  resolveSkillRelativePath,
  skillReadRootsFromDirs,
} from "../../src/shared/skills/read-roots";

const PROJECT = "/Users/me/paper";
const TIKZ = "/app/teams/core/skills/figure-tikz";
const MPL = "/app/teams/core/skills/figure-matplotlib";

describe("skillReadRootsFromDirs", () => {
  it("normalizes and dedupes skill folders", () => {
    expect(skillReadRootsFromDirs([
      { dir: `${TIKZ}/` },
      { dir: TIKZ },
      { dir: "  " },
      { dir: MPL },
    ])).toEqual([TIKZ, MPL]);
  });

  it("drops leftover paper hangars and keeps home / bundled dirs", () => {
    expect(skillReadRootsFromDirs([
      { dir: TIKZ },
      { dir: `${PROJECT}/.prismnext/agent/skills/old` },
      { dir: "/Users/me/.prismnext/skills/my-flow" },
    ])).toEqual([TIKZ, "/Users/me/.prismnext/skills/my-flow"]);
  });
});

describe("isPathUnderSkillReadRoots", () => {
  it("matches the skill folder and files inside it", () => {
    expect(isPathUnderSkillReadRoots(`${TIKZ}/library/catalog.json`, [TIKZ])).toBe(true);
    expect(isPathUnderSkillReadRoots(TIKZ, [TIKZ])).toBe(true);
    expect(isPathUnderSkillReadRoots("/elsewhere/catalog.json", [TIKZ])).toBe(false);
  });
});

describe("resolveSkillRelativePath", () => {
  const exists = new Set([
    `${TIKZ}/library/catalog.json`,
    `${TIKZ}/library/templates/llm-serving-stack/template.tex`,
    `${TIKZ}/library/templates/gan/template.tex`,
    `${MPL}/scripts/plot_template.py`,
    `${PROJECT}/figures/local.tex`,
  ]);
  const has = (p: string) => exists.has(p);

  it("rewrites a unique skill-relative path", () => {
    expect(resolveSkillRelativePath("library/catalog.json", PROJECT, [TIKZ, MPL], has)).toEqual({
      action: "rewrite",
      abs: `${TIKZ}/library/catalog.json`,
    });
  });

  it("keeps a path that already exists in the project", () => {
    exists.add(`${PROJECT}/library/catalog.json`);
    expect(resolveSkillRelativePath("library/catalog.json", PROJECT, [TIKZ], has)).toEqual({
      action: "keep",
    });
    exists.delete(`${PROJECT}/library/catalog.json`);
  });

  it("keeps absolute paths and parent escapes", () => {
    expect(resolveSkillRelativePath(`${TIKZ}/SKILL.md`, PROJECT, [TIKZ], has)).toEqual({
      action: "keep",
    });
    expect(resolveSkillRelativePath("../figure-tikz/library/catalog.json", PROJECT, [TIKZ], has)).toEqual({
      action: "keep",
    });
  });

  it("reports ambiguous bare names that exist in several templates", () => {
    const both = new Set([
      `${TIKZ}/template.tex`,
      `${MPL}/template.tex`,
    ]);
    const result = resolveSkillRelativePath(
      "template.tex",
      PROJECT,
      [TIKZ, MPL],
      (p) => both.has(p),
    );
    expect(result.action).toBe("ambiguous");
    if (result.action === "ambiguous") {
      expect(result.candidates).toEqual([`${TIKZ}/template.tex`, `${MPL}/template.tex`]);
      expect(formatAmbiguousSkillPath("template.tex", result.candidates)).toContain(TIKZ);
    }
  });

  it("keeps a miss so the tool can fail normally", () => {
    expect(resolveSkillRelativePath("no-such-file.tex", PROJECT, [TIKZ], has)).toEqual({
      action: "keep",
    });
  });
});
