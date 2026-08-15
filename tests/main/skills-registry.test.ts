import {
  normalizeRegistryIndexUrl,
  parseRegistryIndex,
  resolveArtifactUrl,
  skillNameToFolderId,
  installRegistrySkill,
} from "../../src/main/services/skills-registry";
import {
  findLibraryCardByRegistryUrl,
  libraryCardForRegistryUrl,
  REMOTE_SKILL_LIBRARY_PRESETS,
  SKILL_LIBRARY_CARDS,
} from "../../src/shared/skill-libraries";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(skills[0].files).toEqual(["SKILL.md", "README.md"]);
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

  it("installs multi-file skill-md packages from registry index", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-skill-install-"));
    const fetchMock = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/local-pack/SKILL.md")) {
        return new Response("---\nname: local-pack\ndescription: Pack\n---\n# Pack\n");
      }
      if (href.endsWith("/local-pack/README.md")) {
        return new Response("# Notes\n");
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      await installRegistrySkill(
        root,
        {
          name: "local-pack",
          description: "Pack",
          type: "skill-md",
          url: "https://registry.test/local-pack/SKILL.md",
          files: ["SKILL.md", "README.md"],
        },
        "https://registry.test/index.json",
      );

      const skillDir = join(root, ".prismnext/agent/teams/project.local/skills/local-pack");
      expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
      expect(existsSync(join(skillDir, "README.md"))).toBe(true);
      expect(readFileSync(join(skillDir, "README.md"), "utf-8")).toContain("# Notes");
    } finally {
      vi.unstubAllGlobals();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("skill-libraries", () => {
  it("includes built-in remote cards (no Core-as-curated)", () => {
    expect(SKILL_LIBRARY_CARDS.some((c) => c.id === "prism-curated")).toBe(false);
    expect(SKILL_LIBRARY_CARDS.some((c) => c.id === "cloudflare-docs")).toBe(true);
    expect(REMOTE_SKILL_LIBRARY_PRESETS.length).toBeGreaterThan(0);
  });

  it("finds card by registry URL", () => {
    const card = findLibraryCardByRegistryUrl(
      "https://developers.cloudflare.com/.well-known/agent-skills/index.json",
    );
    expect(card?.id).toBe("cloudflare-docs");
  });

  it("creates custom card for unknown registry URL", () => {
    const card = libraryCardForRegistryUrl("https://custom.example/index.json");
    expect(card.kind).toBe("remote");
    expect(card.name).toBe("custom.example");
  });
});
