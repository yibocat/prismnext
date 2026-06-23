import { describe, expect, it } from "vitest";
import {
  normalizeRegistryIndexUrl,
  parseRegistryIndex,
  resolveArtifactUrl,
  skillNameToFolderId,
} from "../../src/main/services/skills-registry";
import {
  findLibraryCardByRegistryUrl,
  libraryCardForRegistryUrl,
  SKILL_LIBRARY_CARDS,
} from "../../src/renderer/lib/agent/skill-libraries";

describe("skills-registry", () => {
  it("normalizes hostname to well-known index.json", () => {
    expect(normalizeRegistryIndexUrl("agentskills.io")).toBe(
      "https://agentskills.io/.well-known/agent-skills/index.json",
    );
  });

  it("preserves full index.json URL", () => {
    const url = "https://example.com/.well-known/agent-skills/index.json";
    expect(normalizeRegistryIndexUrl(url)).toBe(url);
  });

  it("appends index.json to well-known directory", () => {
    expect(
      normalizeRegistryIndexUrl("https://example.com/.well-known/agent-skills"),
    ).toBe("https://example.com/.well-known/agent-skills/index.json");
  });

  it("parses Agent Skills Discovery index with url field", () => {
    const indexUrl = "https://registry.test/.well-known/agent-skills/index.json";
    const skills = parseRegistryIndex(indexUrl, {
      skills: [
        {
          name: "demo-skill",
          description: "A demo",
          type: "skill-md",
          url: "https://cdn.test/demo/SKILL.md",
        },
      ],
    });
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "demo-skill",
      type: "skill-md",
      url: "https://cdn.test/demo/SKILL.md",
    });
  });

  it("parses OpenCode-style index with files array", () => {
    const indexUrl = "https://registry.test/index.json";
    const skills = parseRegistryIndex(indexUrl, {
      skills: [
        {
          name: "local-pack",
          description: "Pack",
          files: ["SKILL.md", "README.md"],
        },
      ],
    });
    expect(skills[0].url).toBe("https://registry.test/local-pack/SKILL.md");
    expect(skills[0].type).toBe("skill-md");
  });

  it("detects archive type from extension", () => {
    const skills = parseRegistryIndex("https://r.test/index.json", {
      skills: [{ name: "big", url: "https://r.test/big.tar.gz" }],
    });
    expect(skills[0].type).toBe("archive");
  });

  it("resolves relative artifact URLs against index directory", () => {
    expect(
      resolveArtifactUrl(
        "https://registry.test/.well-known/agent-skills/index.json",
        "packs/foo/SKILL.md",
      ),
    ).toBe("https://registry.test/.well-known/agent-skills/packs/foo/SKILL.md");
  });

  it("maps skill name to folder id", () => {
    expect(skillNameToFolderId("My-Skill")).toBe("my-skill");
  });
});

describe("skill-libraries", () => {
  it("includes built-in remote cards", () => {
    expect(SKILL_LIBRARY_CARDS.some((c) => c.id === "prism-curated")).toBe(true);
    expect(SKILL_LIBRARY_CARDS.some((c) => c.id === "agentskills")).toBe(true);
  });

  it("finds card by registry URL", () => {
    const card = findLibraryCardByRegistryUrl(
      "https://agentskills.io/.well-known/agent-skills/index.json",
    );
    expect(card?.id).toBe("agentskills");
  });

  it("creates custom card for unknown registry URL", () => {
    const card = libraryCardForRegistryUrl("https://custom.example/index.json");
    expect(card.kind).toBe("remote");
    expect(card.name).toBe("custom.example");
  });
});
