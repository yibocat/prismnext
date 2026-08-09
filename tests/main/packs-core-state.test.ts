/**
 * Core content state operations (Phase 6): getCoreContentModificationState
 * and resetCoreContentToDefaults on top of packs.json.
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
  getCoreContentModificationState,
  readPacksState,
  resetCoreContentToDefaults,
  saveContentOverride,
  setContentDisabled,
  writePacksState,
} from "../../src/main/services/packs-state";
import type { PacksState } from "../../src/shared/packs/types";

let root: string | undefined;
let agentsDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "packs-core-state-"));
  agentsDir = join(root, ".prismnext", "agent");
  mkdirSync(agentsDir, { recursive: true });
  // Seed a fresh packs.json so reads/writes target the fixture project.
  const initial: PacksState = {
    stateVersion: 2,
    packs: [],
    disabledContent: [],
    contentOverrides: {},
  };
  writePacksState(root, initial);
});

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

const CORE_EXPERTS = [
  "prismnext.core:peer-reviewer",
  "prismnext.core:methodology-auditor",
];

describe("getCoreContentModificationState", () => {
  it("returns zeros on a fresh state", () => {
    const state = getCoreContentModificationState(root!, CORE_EXPERTS);
    expect(state).toEqual({ disabledCount: 0, overrideCount: 0 });
  });

  it("counts disabled and overridden core content independently", () => {
    setContentDisabled(root!, "prismnext.core:peer-reviewer", true);
    saveContentOverride(root!, "prismnext.core:methodology-auditor", { temperature: 0.2 });
    const state = getCoreContentModificationState(root!, CORE_EXPERTS);
    expect(state).toEqual({ disabledCount: 1, overrideCount: 1 });
  });

  it("only counts the FQIDs passed in (kind-aware view)", () => {
    // Disable an orchestrator + an expert; only the expert set is passed.
    setContentDisabled(root!, "prismnext.core:research-prism", true);
    setContentDisabled(root!, "prismnext.core:peer-reviewer", true);
    const expertState = getCoreContentModificationState(root!, CORE_EXPERTS);
    expect(expertState.disabledCount).toBe(1);
  });
});

describe("resetCoreContentToDefaults", () => {
  it("clears disabled + overrides for the given FQID set", () => {
    setContentDisabled(root!, "prismnext.core:peer-reviewer", true);
    saveContentOverride(root!, "prismnext.core:methodology-auditor", { temperature: 0.2 });
    // Keep a non-core override untouched.
    saveContentOverride(root!, "prismnext.research-notes:reading-notes-coach", { temperature: 0.5 });

    resetCoreContentToDefaults(root!, CORE_EXPERTS);

    const state = readPacksState(root!);
    expect(state.disabledContent).not.toContain("prismnext.core:peer-reviewer");
    expect(state.contentOverrides["prismnext.core:methodology-auditor"]).toBeUndefined();
    // Non-core data survives.
    expect(state.contentOverrides["prismnext.research-notes:reading-notes-coach"]).toEqual({
      temperature: 0.5,
    });
  });

  it("is idempotent when nothing matches", () => {
    resetCoreContentToDefaults(root!, CORE_EXPERTS);
    const state = readPacksState(root!);
    expect(state.disabledContent).toEqual([]);
    expect(state.contentOverrides).toEqual({});
  });

  it("persists atomically to packs.json", () => {
    setContentDisabled(root!, "prismnext.core:peer-reviewer", true);
    resetCoreContentToDefaults(root!, CORE_EXPERTS);
    const raw = JSON.parse(readFileSync(join(agentsDir, "packs.json"), "utf-8"));
    expect(raw.disabledContent).toEqual([]);
    expect(existsSync(join(agentsDir, "packs.json"))).toBe(true);
  });
});
