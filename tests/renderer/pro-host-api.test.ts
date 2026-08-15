import { describe, expect, it, vi, beforeEach } from "vitest";
import { createProHostAPI } from "../../src/renderer/lib/pro/host-api";
import { proContributions } from "../../src/renderer/lib/pro/contributions";
import type { LicenseSnapshot } from "../../src/shared/pro";
import { PRO_DEV_TEST_KEY, validateActivationKey } from "../../src/shared/pro";

function licensedApi() {
  const activated = validateActivationKey(PRO_DEV_TEST_KEY);
  if (!activated.ok) throw new Error("expected test key");
  const license: LicenseSnapshot = activated.license;
  return createProHostAPI({ getLicense: () => license });
}

describe("ProHostAPI contribution layer", () => {
  beforeEach(() => {
    proContributions.clear();
  });

  it("refuses registerSettings without an active license", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = createProHostAPI({ getLicense: () => null });
    api.registerSettings({
      id: "pro-settings-denied",
      sectionLabel: "Denied",
      Content: () => null,
    });
    expect(warn).toHaveBeenCalled();
    expect(proContributions.getSettings()).toHaveLength(0);
    warn.mockRestore();
  });

  it("registers settings into the contribution layer", () => {
    const api = licensedApi();
    api.declareFeatures(["hello"]);
    api.registerSettings({
      id: "pro-settings-demo",
      sectionLabel: "Pro Demo",
      Content: () => null,
    });

    expect(proContributions.getSettings()).toHaveLength(1);
    expect(proContributions.getDeclaredFeatures()).toEqual(["hello"]);
  });

  it("exposes runtime Host doors (project root + navigate + notify)", () => {
    const api = licensedApi();
    const root = api.getProjectRoot();
    expect(root === null || typeof root === "string").toBe(true);
    expect(() => api.navigateToSettings("about")).not.toThrow();
    expect(() =>
      api.notify({ title: "t", description: "d", tone: "info" }),
    ).not.toThrow();
  });
});
