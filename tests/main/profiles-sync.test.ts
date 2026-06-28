import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listAgentProfiles,
  buildProfilePromptOverlay,
  resolveProfileId,
  builtinsDifferFromDefaults,
  setBuiltinProfileEnabled,
  restoreBuiltinProfiles,
  resetAllBuiltinProfilesToDefaults,
  saveCustomProfile,
  saveBuiltinProfileOverride,
  resetBuiltinProfileOverride,
  getProfileRuntimeFilters,
  deleteCustomProfile,
  listDisabledBuiltinProfiles,
} from "../../src/main/services/profiles-sync";

describe("profiles-sync", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-profiles-"));
  });

  it("lists bundled profiles without mode field", () => {
    const profiles = listAgentProfiles(root);
    expect(profiles.some((p) => p.id === "academic-writer")).toBe(true);
    expect(profiles.some((p) => p.id === "citation-auditor")).toBe(true);
    expect(profiles.every((p) => !("mode" in p))).toBe(true);
    expect(profiles.find((p) => p.id === "academic-writer")?.effectiveModules.length).toBeGreaterThan(0);
  });

  it("builds profile prompt overlay", () => {
    const overlay = buildProfilePromptOverlay(root, "academic-writer");
    expect(overlay?.profileName).toBe("Academic Writer");
    expect(overlay?.profileInstructions).toContain("academic writing agent");
  });

  it("resolves profile only when explicitly selected", () => {
    expect(resolveProfileId(root, null)).toBeNull();
    expect(resolveProfileId(root, undefined)).toBeNull();
    expect(resolveProfileId(root, "academic-writer")).toBe("academic-writer");
    expect(resolveProfileId(root, "citation-auditor")).toBe("citation-auditor");
    expect(resolveProfileId(root, "nonexistent")).toBeNull();
  });

  it("returns runtime filters for profiles with allowlists", () => {
    const filters = getProfileRuntimeFilters(root, "citation-auditor");
    expect(filters?.skills).toContain("academic-citations");
    expect(filters?.modules).toContain("citations");
  });

  it("saves and deletes custom profiles", () => {
    const saved = saveCustomProfile(root, {
      name: "My Reviewer",
      description: "Custom review profile",
      instructions: "Review the manuscript carefully.",
      modules: ["citations"],
    });
    expect(saved.id).toBeTruthy();
    expect(listAgentProfiles(root).some((p) => p.id === saved.id)).toBe(true);
    deleteCustomProfile(root, saved.id);
    expect(listAgentProfiles(root).some((p) => p.id === saved.id)).toBe(false);
  });

  it("removing builtin hides it from the list", () => {
    setBuiltinProfileEnabled(root, "citation-auditor", false);
    const profiles = listAgentProfiles(root);
    expect(profiles.some((p) => p.id === "citation-auditor")).toBe(false);
    expect(listDisabledBuiltinProfiles(root).some((p) => p.id === "citation-auditor")).toBe(true);
  });

  it("reset restores removed and customized built-in profiles", () => {
    setBuiltinProfileEnabled(root, "citation-auditor", false);
    saveBuiltinProfileOverride(root, {
      profileId: "academic-writer",
      modules: ["citations"],
    });
    expect(builtinsDifferFromDefaults(root)).toBe(true);

    resetAllBuiltinProfilesToDefaults(root);

    const profiles = listAgentProfiles(root);
    expect(profiles.some((p) => p.id === "citation-auditor")).toBe(true);
    expect(listDisabledBuiltinProfiles(root)).toHaveLength(0);
    expect(builtinsDifferFromDefaults(root)).toBe(false);
    const writer = profiles.find((p) => p.id === "academic-writer");
    expect(writer?.modules).toContain("academic-writing");
  });

  it("restores disabled builtin profiles", () => {
    setBuiltinProfileEnabled(root, "citation-auditor", false);
    setBuiltinProfileEnabled(root, "literature-scout", false);
    restoreBuiltinProfiles(root);
    const profiles = listAgentProfiles(root);
    expect(profiles.some((p) => p.id === "citation-auditor")).toBe(true);
    expect(profiles.some((p) => p.id === "literature-scout")).toBe(true);
    expect(listDisabledBuiltinProfiles(root)).toHaveLength(0);
  });

  it("saves built-in profile capability overrides per project", () => {
    const saved = saveBuiltinProfileOverride(root, {
      profileId: "academic-writer",
      modules: ["citations"],
    });
    expect(saved.modules).toEqual(["citations"]);
    resetBuiltinProfileOverride(root, "academic-writer");
    const restored = listAgentProfiles(root).find((p) => p.id === "academic-writer");
    expect(restored?.modules).toContain("academic-writing");
  });
});
