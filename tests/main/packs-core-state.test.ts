/**
 * Core content state operations (Phase 6): getCoreAssetModificationState
 * and resetCoreAssetsToDefaults on top of packs.json.
 *
 * These replaced the legacy builtin-manifest contract; the packs IPC surface
 * (`packs:getCoreState` / `packs:resetCoreDefaults`) is a thin wrapper that
 * resolves the kind-aware core FQID set from the resolver view.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  getCoreAssetModificationState,
  readTeamsState,
  resetCoreAssetsToDefaults,
  saveAssetOverride,
  setAssetDisabled,
  writeTeamsState,
} from "../../src/main/services/teams-state";
import type { TeamsProjectState } from "../../src/shared/teams/types";

let root: string | undefined;
let agentsDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "packs-core-state-"));
  agentsDir = join(root, ".prismnext", "agent");
  mkdirSync(agentsDir, { recursive: true });
  // Seed a fresh packs.json so reads/writes target the fixture project.
  const initial: TeamsProjectState = {
    stateVersion: 2,
    packs: [],
    disabledContent: [],
    contentOverrides: {},
  };
  writeTeamsState(root, initial);
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

const CORE_EXPERTS = [
  "prismnext.core:peer-reviewer",
  "prismnext.core:methodology-auditor",
];

describe("getCoreAssetModificationState", () => {
  it("returns zeros on a fresh state", () => {
    const state = getCoreAssetModificationState(root!, CORE_EXPERTS);
    expect(state).toEqual({ disabledCount: 0, overrideCount: 0 });
  });

  it("counts disabled and overridden core content independently", () => {
    setAssetDisabled(root!, "prismnext.core:peer-reviewer", true);
    saveAssetOverride(root!, "prismnext.core:methodology-auditor", { temperature: 0.2 });
    const state = getCoreAssetModificationState(root!, CORE_EXPERTS);
    expect(state).toEqual({ disabledCount: 1, overrideCount: 1 });
  });

  it("only counts the FQIDs passed in (kind-aware view)", () => {
    // Disable an orchestrator + an expert; only the expert set is passed.
    setAssetDisabled(root!, "prismnext.core:research-prism", true);
    setAssetDisabled(root!, "prismnext.core:peer-reviewer", true);
    const expertState = getCoreAssetModificationState(root!, CORE_EXPERTS);
    expect(expertState.disabledCount).toBe(1);
  });
});

describe("resetCoreAssetsToDefaults", () => {
  it("clears disabled + overrides for the given FQID set", () => {
    setAssetDisabled(root!, "prismnext.core:peer-reviewer", true);
    saveAssetOverride(root!, "prismnext.core:methodology-auditor", { temperature: 0.2 });
    // Keep a non-core override untouched.
    saveAssetOverride(root!, "prismnext.research-notes:reading-notes-coach", { temperature: 0.5 });

    resetCoreAssetsToDefaults(root!, CORE_EXPERTS);

    const state = readTeamsState(root!);
    expect(state.disabledContent).not.toContain("prismnext.core:peer-reviewer");
    expect(state.contentOverrides["prismnext.core:methodology-auditor"]).toBeUndefined();
    // Non-core data survives.
    expect(state.contentOverrides["prismnext.research-notes:reading-notes-coach"]).toEqual({
      temperature: 0.5,
    });
  });

  it("is idempotent when nothing matches", () => {
    resetCoreAssetsToDefaults(root!, CORE_EXPERTS);
    const state = readTeamsState(root!);
    expect(state.disabledContent).toEqual([]);
    expect(state.contentOverrides).toEqual({});
  });

  it("persists atomically to packs.json", () => {
    setAssetDisabled(root!, "prismnext.core:peer-reviewer", true);
    resetCoreAssetsToDefaults(root!, CORE_EXPERTS);
    const raw = JSON.parse(readFileSync(join(agentsDir, "packs.json"), "utf-8"));
    expect(raw.disabledContent).toEqual([]);
    expect(existsSync(join(agentsDir, "packs.json"))).toBe(true);
  });
});
