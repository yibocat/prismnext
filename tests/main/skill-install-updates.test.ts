import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSkillUpdates } from "../../src/main/skills/skill-install-updates";
import { writeSkillsManifest } from "../../src/main/skills/skills-sync";
import { sha256Hex } from "../../src/main/skills/skill-install-digest";
import { homeSkillDir, setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";

describe("skill-install-updates", () => {
  let projectRoot = "";
  let userHome = "";

  afterEach(() => {
    vi.unstubAllGlobals();
    setWorkbenchUserHomeOverride(null);
    if (projectRoot) {
      rmSync(projectRoot, { recursive: true, force: true });
      projectRoot = "";
    }
    if (userHome) {
      rmSync(userHome, { recursive: true, force: true });
      userHome = "";
    }
  });

  function setupProject(manifestInstalls: Parameters<typeof writeSkillsManifest>[1]["installs"]) {
    userHome = mkdtempSync(join(tmpdir(), "prism-skill-updates-home-"));
    setWorkbenchUserHomeOverride(userHome);
    projectRoot = mkdtempSync(join(tmpdir(), "prism-skill-updates-"));
    mkdirSync(homeSkillDir("demo-skill"), { recursive: true });
    writeFileSync(
      join(homeSkillDir("demo-skill"), "SKILL.md"),
      "---\nname: demo\nversion: 1.0.0\n---\n",
      "utf-8",
    );
    writeSkillsManifest(projectRoot, { disabled: [], sources: [], installs: manifestInstalls ?? [] });
  }

  it("detects GitHub content changes via SKILL.md digest", async () => {
    const installedMd = "---\nname: demo\nversion: 1.0.0\n---\n";
    setupProject([
      {
        skillId: "demo-skill",
        origin: {
          adapter: "github",
          repo: "owner/repo",
          ref: "main",
          path: "",
        },
        installedAt: new Date().toISOString(),
        contentVersion: "1.0.0",
        contentDigest: sha256Hex(installedMd),
        packagePath: "skills/demo-skill",
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("raw.githubusercontent.com")) {
          return new Response("---\nname: demo\nversion: 2.0.0\n---\n", { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const updates = await checkSkillUpdates(projectRoot);
    expect(updates).toHaveLength(1);
    expect(updates[0].updateAvailable).toBe(true);
    expect(updates[0].status).toBe("update_available");
  });

  it("reports current when discovery digest and content match", async () => {
    const remoteMd = "---\nname: wrangler\nversion: 3.0.0\n---\n";
    const digest = `sha256:${sha256Hex(remoteMd)}`;
    setupProject([
      {
        skillId: "wrangler",
        origin: { adapter: "discovery", indexUrl: "https://developers.cloudflare.com" },
        installedAt: new Date().toISOString(),
        contentVersion: "3.0.0",
        contentDigest: sha256Hex(remoteMd),
        registryDigest: sha256Hex(remoteMd),
      },
    ]);
    mkdirSync(homeSkillDir("wrangler"), { recursive: true });
    writeFileSync(join(homeSkillDir("wrangler"), "SKILL.md"), remoteMd, "utf-8");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("index.json")) {
          return new Response(
            JSON.stringify({
              skills: [
                {
                  name: "wrangler",
                  description: "Wrangler CLI",
                  type: "skill-md",
                  url: "/.well-known/agent-skills/wrangler/SKILL.md",
                  digest,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("SKILL.md")) {
          return new Response(remoteMd, { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const updates = await checkSkillUpdates(projectRoot);
    expect(updates[0].updateAvailable).toBe(false);
    expect(updates[0].status).toBe("current");
  });

  it("detects registry digest change", async () => {
    const remoteMd = "---\nname: wrangler\n---\n";
    setupProject([
      {
        skillId: "wrangler",
        origin: { adapter: "discovery", indexUrl: "https://developers.cloudflare.com" },
        installedAt: new Date().toISOString(),
        contentDigest: sha256Hex(remoteMd),
        registryDigest: "olddigest",
      },
    ]);
    mkdirSync(homeSkillDir("wrangler"), { recursive: true });
    writeFileSync(join(homeSkillDir("wrangler"), "SKILL.md"), remoteMd, "utf-8");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("index.json")) {
          return new Response(
            JSON.stringify({
              skills: [
                {
                  name: "wrangler",
                  type: "skill-md",
                  url: "/.well-known/agent-skills/wrangler/SKILL.md",
                  digest: `sha256:${sha256Hex(remoteMd)}`,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("SKILL.md")) {
          return new Response(remoteMd, { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    const updates = await checkSkillUpdates(projectRoot);
    expect(updates[0].updateAvailable).toBe(true);
  });
});
