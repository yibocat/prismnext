import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClosedResourceLoader } from "../../src/main/agent/pi-sdk-runtime";
import { loadPiSkillsFromDirs } from "../../src/main/agent/skill-loader";

const temps: string[] = [];

function skillDir(id: string, body: string): string {
  const root = mkdtempSync(join(tmpdir(), "prism-skill-"));
  temps.push(root);
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${id} help\n---\n\n${body}\n`,
    "utf-8",
  );
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Pi host skill loader", () => {
  it("loads SKILL.md dirs into Pi skills without scanning the home directory", () => {
    const cite = skillDir("cite-check", "Check citations.");
    const skills = loadPiSkillsFromDirs([
      { dir: cite, source: "team/cite-check" },
    ]);
    expect(skills).toEqual([
      expect.objectContaining({
        name: "cite-check",
        description: "cite-check help",
        filePath: join(cite, "SKILL.md"),
      }),
    ]);
  });

  it("keeps the first skill when two dirs share a name", () => {
    const first = skillDir("shared", "First wins.");
    const second = skillDir("shared", "Should be ignored.");
    const skills = loadPiSkillsFromDirs([
      { dir: first, source: "a/shared" },
      { dir: second, source: "b/shared" },
    ]);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.filePath).toBe(join(first, "SKILL.md"));
  });

  it("injects those skills through ClosedResourceLoader and still hides discovery", () => {
    const cite = skillDir("cite-check", "Check citations.");
    const skills = loadPiSkillsFromDirs([{ dir: cite, source: "team/cite-check" }]);
    const loader = new ClosedResourceLoader({
      systemPrompt: "composed in memory",
      skills,
    });
    expect(loader.getSystemPrompt()).toBe("composed in memory");
    expect(loader.getSkills().skills.map((s) => s.name)).toEqual(["cite-check"]);
    expect(loader.getExtensions().extensions).toEqual([]);
    expect(loader.getAgentsFiles()).toEqual({ agentsFiles: [] });
  });
});
