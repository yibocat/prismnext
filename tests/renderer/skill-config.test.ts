import { describe, expect, it } from "vitest";
import {
  buildSkillMd,
  isValidSkillName,
  normalizePastedSkill,
  parseSkillMd,
} from "../../src/renderer/lib/agent/skill-config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RESOURCES_SKILLS = join(process.cwd(), "resources", "skills");

describe("skill-config", () => {
  it("round-trips SKILL.md", () => {
    const md = buildSkillMd({
      name: "citations",
      description: "BibTeX help",
      body: "# Citations\n\nUse natbib.",
    });
    const parsed = parseSkillMd(md);
    expect(parsed.name).toBe("citations");
    expect(parsed.description).toBe("BibTeX help");
    expect(parsed.body).toContain("natbib");
  });

  it("validates skill names", () => {
    expect(isValidSkillName("academic-citations")).toBe(true);
    expect(isValidSkillName("Bad_Name")).toBe(false);
  });

  it("parses pasted SKILL.md", () => {
    const pasted = `---
name: test-skill
description: For testing
---
# Body`;
    const { meta, error } = normalizePastedSkill(pasted);
    expect(error).toBeUndefined();
    expect(meta.name).toBe("test-skill");
  });
});

describe("bundled skill files", () => {
  it("writing-related-work SKILL.md parses correctly", () => {
    const content = readFileSync(
      join(RESOURCES_SKILLS, "writing-related-work", "SKILL.md"),
      "utf-8",
    );
    const parsed = parseSkillMd(content);
    expect(parsed.name).toBe("writing-related-work");
    expect(parsed.description).toContain("Related Work");
    expect(parsed.body).toContain("# Writing: Related Work");
  });

  it("skill-creator SKILL.md parses correctly", () => {
    const content = readFileSync(
      join(RESOURCES_SKILLS, "skill-creator", "SKILL.md"),
      "utf-8",
    );
    const parsed = parseSkillMd(content);
    expect(parsed.name).toBe("skill-creator");
    expect(parsed.description).toContain("create");
    expect(parsed.body).toContain(".prismnext/agent/skills");
  });
});
