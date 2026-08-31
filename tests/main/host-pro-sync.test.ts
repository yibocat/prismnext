import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHostContext, dispatchHostMethod } from "../../src/host/handler-registry";
import { listTeams } from "../../src/main/teams/resolver";
import { licenseGrants, __resetHostLicenseSessionForTests } from "../../src/main/teams/teams-license";
import { __resetTeamsResolverForTests } from "../../src/main/teams/resolver";
import { setAppTeamsDirForTests } from "../../src/main/teams/scope";
import { setAppTeamsStateDataDir, writeAppTeamsState } from "../../src/main/teams/state-app";
import { emptyAppTeamsState } from "../../src/shared/teams/state";
import { invalidateCatalog } from "../../src/main/teams/catalog";
import { setWorkbenchUserHomeOverride } from "../../src/main/workbench/home";
import { hashProPackageTree } from "../../src/main/remote/pro-push";

const CORE = join(process.cwd(), "resources", "teams");

function writeProTeam(packageDir: string, teamId: string): void {
  const teamDir = join(packageDir, "teams", teamId);
  const orchDir = join(teamDir, "orchestrators", "lead");
  mkdirSync(orchDir, { recursive: true });
  writeFileSync(
    join(packageDir, "package.json"),
    `${JSON.stringify({ name: "@prismnext/pro", private: true, prismnext: { teamsRoot: "teams" } }, null, 2)}\n`,
  );
  writeFileSync(
    join(teamDir, "team.json"),
    `${JSON.stringify({
      id: teamId,
      name: "Pro Fixture",
      description: "test pro team",
      version: "0.1.0",
      packFormatVersion: 1,
      formatVersion: 2,
      tier: "pro",
      publisher: "prismnext",
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(orchDir, "orchestrator.json"),
    `${JSON.stringify({ id: "lead", name: "Lead", description: "lead" }, null, 2)}\n`,
  );
  writeFileSync(join(orchDir, "instructions.md"), "Lead instructions.\n");
}

describe("Host Pro pack sync + grant", () => {
  const prevTeams = process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
  const prevHostPro = process.env.PRISM_HOST_PRO_PACKAGE_DIR;

  afterEach(() => {
    __resetHostLicenseSessionForTests();
    __resetTeamsResolverForTests();
    setWorkbenchUserHomeOverride(null);
    setAppTeamsDirForTests(null);
    setAppTeamsStateDataDir(null);
    invalidateCatalog();
    if (prevTeams === undefined) delete process.env.PRISM_FIRST_PARTY_TEAMS_DIR;
    else process.env.PRISM_FIRST_PARTY_TEAMS_DIR = prevTeams;
    if (prevHostPro === undefined) delete process.env.PRISM_HOST_PRO_PACKAGE_DIR;
    else process.env.PRISM_HOST_PRO_PACKAGE_DIR = prevHostPro;
  });

  it("skips a matching stamp and unlocks a Pro team after commit + grant", async () => {
    const home = mkdtempSync(join(tmpdir(), "prism-host-pro-"));
    setWorkbenchUserHomeOverride(home);
    process.env.PRISM_FIRST_PARTY_TEAMS_DIR = CORE;
    setAppTeamsDirForTests(join(home, ".prismnext", "teams"));
    setAppTeamsStateDataDir(join(home, ".prismnext"));
    writeAppTeamsState(emptyAppTeamsState());

    const paper = join(home, "paper");
    mkdirSync(join(paper, ".workbench", "agent"), { recursive: true });
    const src = mkdtempSync(join(tmpdir(), "prism-pro-src-"));
    writeProTeam(src, "prismnext.pro.fixture");
    const sha256 = hashProPackageTree(src);

    const ctx = createHostContext();
    ctx.remoteRoot = paper;
    const begin = await dispatchHostMethod("pro:beginSync", { sha256 }, ctx) as { action: string };
    expect(begin.action).toBe("ready");

    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const walk = (dir: string, root = dir): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        if (statSync(abs).isDirectory()) out.push(...walk(abs, root));
        else out.push(abs.slice(root.length).replace(/\\/g, "/").replace(/^\/+/, ""));
      }
      return out;
    };
    for (const rel of walk(src)) {
      await dispatchHostMethod("pro:writeFile", {
        relPath: rel,
        bytes: readFileSync(join(src, rel)).toString("base64"),
      }, ctx);
    }
    const committed = await dispatchHostMethod("pro:commitSync", { sha256 }, ctx) as {
      action: string;
      registered: string[];
    };
    expect(committed.action).toBe("committed");
    expect(committed.registered).toContain("prismnext.pro.fixture");

    const again = await dispatchHostMethod("pro:beginSync", { sha256 }, ctx) as { action: string };
    expect(again.action).toBe("skipped");

    await dispatchHostMethod("host.configure", {
      modelKeys: "gateway",
      proGrant: {
        plan: "pro",
        activatedAt: new Date().toISOString(),
        expiresAt: null,
      },
    }, ctx);
    expect(licenseGrants()).toBe(true);
    const listed = listTeams(paper);
    const pro = listed.find((t) => t.manifest.id === "prismnext.pro.fixture");
    expect(pro?.licenseOk).toBe(true);
    expect(pro?.installed).toBe(true);
    expect(pro?.enabled).toBe(true);
    expect(pro?.blockedBy).toBeUndefined();

    await dispatchHostMethod("host.configure", { modelKeys: "gateway", proGrant: null }, ctx);
    expect(licenseGrants()).toBe(false);
    const locked = listTeams(paper).find((t) => t.manifest.id === "prismnext.pro.fixture");
    expect(locked?.licenseOk).toBe(false);
  });
});
