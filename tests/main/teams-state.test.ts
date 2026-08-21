/**
 * Team architecture v2 — state layer tests (design 2026-08-10 §12.1).
 *
 * Covers: resolveTri truth table, normalize whitelist filtering (injection
 * rejection), atomic write, write counter, and listeners (including one that throws).
 */
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emptyAppTeamsState,
  emptyProjectTeamsState,
  normalizeAppTeamsState,
  normalizeProjectTeamsState,
  resolveTri,
  isProjectEnableOverridden,
} from "../../src/shared/teams/state";
import {
  appTeamsStateWriteCounter,
  onAppTeamsStateWritten,
  readAppTeamsState,
  setAppAssetEnabled,
  setAppTeamsStateDataDir,
  setAppTeamEnabled,
  writeAppTeamsState,
} from "../../src/main/teams/state-app";
import {
  onProjectTeamsStateWritten,
  projectTeamsStateWriteCounter,
  readProjectTeamsState,
  setProjectAssetEnabled,
  setProjectTeamEnabled,
  writeProjectTeamsState,
} from "../../src/main/teams/state-project";

describe("resolveTri — the single layer-merge function", () => {
  // Full truth table: project × app × fallback.
  it("project value wins over everything", () => {
    expect(resolveTri(true, true, true)).toBe(true);
    expect(resolveTri(true, false, true)).toBe(true);
    expect(resolveTri(false, true, true)).toBe(false);
    expect(resolveTri(false, false, false)).toBe(false);
  });

  it("app value used when project is unset", () => {
    expect(resolveTri(undefined, true, false)).toBe(true);
    expect(resolveTri(undefined, false, true)).toBe(false);
  });

  it("fallback used when both unset", () => {
    expect(resolveTri(undefined, undefined, true)).toBe(true);
    expect(resolveTri(undefined, undefined, false)).toBe(false);
  });

  it("KEY CASE: project=true overrides app=false (C7 acceptance)", () => {
    expect(resolveTri(true, false, true)).toBe(true);
  });

  it("project=false overrides app=true", () => {
    expect(resolveTri(false, true, true)).toBe(false);
  });
});

describe("isProjectEnableOverridden", () => {
  it("ignores unset project layer", () => {
    expect(isProjectEnableOverridden(undefined, true)).toBe(false);
    expect(isProjectEnableOverridden(undefined, undefined)).toBe(false);
  });

  it("project=true with unset app is not an override (same as default on)", () => {
    expect(isProjectEnableOverridden(true, undefined)).toBe(false);
  });

  it("flags real divergence from effective app value", () => {
    expect(isProjectEnableOverridden(false, undefined)).toBe(true);
    expect(isProjectEnableOverridden(false, true)).toBe(true);
    expect(isProjectEnableOverridden(true, false)).toBe(true);
    expect(isProjectEnableOverridden(true, true)).toBe(false);
    expect(isProjectEnableOverridden(false, false)).toBe(false);
  });
});

describe("normalizeAppTeamsState / normalizeProjectTeamsState — whitelist filtering", () => {
  it("returns empty state for non-object input", () => {
    expect(normalizeAppTeamsState(null)).toEqual(emptyAppTeamsState());
    expect(normalizeAppTeamsState("junk")).toEqual(emptyAppTeamsState());
    expect(normalizeProjectTeamsState(42)).toEqual(emptyProjectTeamsState());
  });

  it("keeps only boolean tri-state values", () => {
    const s = normalizeAppTeamsState({
      teamEnabled: { "a.b": true, "c.d": false, "e.f": "yes", "": true },
    });
    expect(s.teamEnabled).toEqual({ "a.b": true, "c.d": false });
  });

  it("drops non-whitelisted override fields and prototype pollution", () => {
    const s = normalizeProjectTeamsState({
      assetOverrides: {
        "prismnext.core:x": {
          temperature: 0.2,
          allowedExperts: ["a", "b", 3],
          evil: "injected",
          __proto__: { polluted: true },
        },
      },
    });
    const ov = s.assetOverrides["prismnext.core:x"];
    expect(ov.temperature).toBe(0.2);
    expect(ov.allowedExperts).toEqual(["a", "b"]);
    expect((ov as Record<string, unknown>).evil).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("drops overrides with non-fqid keys", () => {
    const s = normalizeProjectTeamsState({
      assetOverrides: { "no-colon": { temperature: 1 }, "a:b": { temperature: 2 } },
    });
    expect(Object.keys(s.assetOverrides)).toEqual(["a:b"]);
  });

  it("normalizes installed records, dropping malformed entries", () => {
    const s = normalizeAppTeamsState({
      installed: [
        { teamId: "a.b", installedAt: "2026-01-01T00:00:00.000Z" },
        { teamId: "" },
        { noTeamId: true },
        "junk",
      ],
    });
    expect(s.installed).toEqual([{ teamId: "a.b", installedAt: "2026-01-01T00:00:00.000Z" }]);
  });
});

describe("state-app / state-project — IO, counter, listeners", () => {
  let dir: string;
  let projectRoot: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "teams-app-state-"));
    projectRoot = mkdtempSync(join(tmpdir(), "teams-project-state-"));
    setAppTeamsStateDataDir(dir);
  });

  afterEach(() => {
    setAppTeamsStateDataDir(null);
    rmSync(dir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("app state: read missing → empty; write → read back", () => {
    expect(readAppTeamsState()).toEqual(emptyAppTeamsState());
    setAppTeamEnabled("acme.tools", false);
    expect(readAppTeamsState().teamEnabled["acme.tools"]).toBe(false);
  });

  it("app state: tri-state null deletes the key (follow default)", () => {
    setAppTeamEnabled("acme.tools", false);
    setAppTeamEnabled("acme.tools", null);
    expect(readAppTeamsState().teamEnabled["acme.tools"]).toBeUndefined();
  });

  it("app state: write counter increments and listeners fire (throwing listener is isolated)", () => {
    const before = appTeamsStateWriteCounter();
    const seen: number[] = [];
    const sub1 = onAppTeamsStateWritten(() => {
      throw new Error("boom");
    });
    const sub2 = onAppTeamsStateWritten(() => seen.push(1));
    writeAppTeamsState(emptyAppTeamsState());
    expect(appTeamsStateWriteCounter()).toBe(before + 1);
    expect(seen).toEqual([1]);
    sub1.dispose();
    sub2.dispose();
  });

  it("project state: read missing → empty; write → read back; counter increments", () => {
    expect(readProjectTeamsState(projectRoot)).toEqual(emptyProjectTeamsState());
    const before = projectTeamsStateWriteCounter();
    setProjectAssetEnabled(projectRoot, "prismnext.core:idea-lab", false);
    expect(readProjectTeamsState(projectRoot).assetEnabled["prismnext.core:idea-lab"]).toBe(false);
    expect(projectTeamsStateWriteCounter()).toBe(before + 1);
  });

  it("project state: listener receives the projectRoot", () => {
    const roots: string[] = [];
    const sub = onProjectTeamsStateWritten((r) => roots.push(r));
    writeProjectTeamsState(projectRoot, emptyProjectTeamsState());
    expect(roots).toEqual([projectRoot]);
    sub.dispose();
  });

  it("project state: corrupt file self-heals to empty", () => {
    const p = join(projectRoot, ".workbench", "agent");
    mkdirSync(p, { recursive: true });
    writeFileSync(join(p, "teams.json"), "{ not json", "utf-8");
    expect(readProjectTeamsState(projectRoot)).toEqual(emptyProjectTeamsState());
    expect(readdirSync(p).some((name) => name.startsWith("teams.json.corrupted."))).toBe(true);
    expect(readProjectTeamsState(projectRoot)).toEqual(emptyProjectTeamsState());
  });

  it("project state: leftover packs.json is not migrated", () => {
    const agentDir = join(projectRoot, ".prismnext", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(
      join(agentDir, "packs.json"),
      JSON.stringify({
        stateVersion: 3,
        defaultOrchestrator: "prismnext.core:research-prism",
        projectPackStates: { "prismnext.core": { enabled: false } },
        disabledContent: [],
        contentOverrides: {},
      }),
      "utf-8",
    );

    expect(readProjectTeamsState(projectRoot)).toEqual(emptyProjectTeamsState());
    expect(existsSync(join(projectRoot, ".workbench", "agent", "teams.json"))).toBe(false);
  });

  it("project state: rewrites persisted user.local identities to project.local", () => {
    const p = join(projectRoot, ".workbench", "agent");
    mkdirSync(p, { recursive: true });
    writeFileSync(
      join(p, "teams.json"),
      JSON.stringify({
        version: 1,
        defaultTeam: "user.local",
        teamEnabled: { "user.local": true },
        assetEnabled: { "user.local:review": false },
        assetOverrides: { "user.local:lead": { temperature: 0.2 } },
      }),
      "utf-8",
    );

    const state = readProjectTeamsState(projectRoot);

    expect(state.defaultTeam).toBe("project.local");
    expect(state.teamEnabled).toEqual({ "project.local": true });
    expect(state.assetEnabled).toEqual({ "project.local:review": false });
    expect(state.assetOverrides["project.local:lead"]?.temperature).toBe(0.2);
  });

  it("app state: corrupt file is backed up before an empty state is written", () => {
    const statePath = join(dir, "teams-state.json");
    writeFileSync(statePath, "{ not json", "utf-8");

    expect(readAppTeamsState()).toEqual(emptyAppTeamsState());
    expect(readdirSync(dir).some((name) => name.startsWith("teams-state.json.corrupted."))).toBe(true);
    expect(readAppTeamsState()).toEqual(emptyAppTeamsState());
  });
});
