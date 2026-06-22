import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ALL_MODULES } from "../../src/main/prompts/modules";
import { resolveActiveModules, resolveActiveModuleKeys } from "../../src/main/prompts/resolve-active-modules";

function setModuleEnabled(key: string, enabled: boolean): void {
  const mod = ALL_MODULES.find((m) => m.key === key);
  if (mod) mod.enabled = enabled;
}

describe("resolveActiveModules", () => {
  const snapshot = ALL_MODULES.map((m) => ({ key: m.key, enabled: m.enabled }));

  afterEach(() => {
    for (const { key, enabled } of snapshot) {
      setModuleEnabled(key, enabled);
    }
  });

  beforeEach(() => {
    setModuleEnabled("workspace-folders", true);
    setModuleEnabled("academic-writing", false);
    setModuleEnabled("citations", false);
    setModuleEnabled("figures-tables", false);
    setModuleEnabled("math-equations", false);
  });

  it("returns all globally enabled modules when profile has no scope", () => {
    setModuleEnabled("citations", true);
    const keys = resolveActiveModuleKeys({});
    expect(keys).toEqual(["workspace-folders", "citations"]);
  });

  it("intersects profile scope with global toggles", () => {
    setModuleEnabled("citations", false);
    const keys = resolveActiveModuleKeys({ profileModules: ["citations", "academic-writing"] });
    expect(keys).toEqual(["workspace-folders"]);
  });

  it("includes profile-selected modules that are globally on", () => {
    setModuleEnabled("citations", true);
    setModuleEnabled("academic-writing", true);
    const keys = resolveActiveModuleKeys({
      profileModules: ["citations", "academic-writing"],
    });
    expect(keys).toEqual(["workspace-folders", "academic-writing", "citations"]);
  });

  it("always considers workspace-folders in profile scope but respects global off", () => {
    setModuleEnabled("workspace-folders", false);
    const keys = resolveActiveModuleKeys({ profileModules: ["citations"] });
    expect(keys).toEqual([]);
  });

  it("returns module objects with keys matching resolveActiveModuleKeys", () => {
    setModuleEnabled("citations", true);
    const modules = resolveActiveModules({ profileModules: ["citations"] });
    expect(modules.map((m) => m.key)).toEqual(resolveActiveModuleKeys({ profileModules: ["citations"] }));
  });
});
