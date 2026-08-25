import { describe, expect, it } from "vitest";
import { PRO_DEV_TEST_KEY, validateActivationKey, type LicenseSnapshot } from "../../src/shared/pro";
import {
  AGENT_REMOTE_FEATURE,
  WORKSPACE_REMOTE_FEATURE,
  hasRemoteAgentEntitlement,
  hasRemoteWorkspaceEntitlement,
} from "../../src/shared/remote";

function license(features: string[]): LicenseSnapshot {
  return {
    key: "PRISM-PRO-TEST-SLICE",
    plan: "pro",
    expiresAt: null,
    activatedAt: "2026-08-25T00:00:00.000Z",
    features,
  };
}

describe("remote entitlements", () => {
  it("grants workspace.remote and agent.remote when features list includes them", () => {
    const snap = license([WORKSPACE_REMOTE_FEATURE, AGENT_REMOTE_FEATURE]);
    expect(hasRemoteWorkspaceEntitlement(snap)).toBe(true);
    expect(hasRemoteAgentEntitlement(snap)).toBe(true);
  });

  it("denies workspace.remote when the license lists other features only", () => {
    const snap = license([AGENT_REMOTE_FEATURE]);
    expect(hasRemoteAgentEntitlement(snap)).toBe(true);
    expect(hasRemoteWorkspaceEntitlement(snap)).toBe(false);
  });

  it("treats an empty Pro features list as all-grant (dev / early builds)", () => {
    const snap = license([]);
    expect(hasRemoteWorkspaceEntitlement(snap)).toBe(true);
    expect(hasRemoteAgentEntitlement(snap)).toBe(true);
  });

  it("grants remote features for the development test key", () => {
    const result = validateActivationKey(PRO_DEV_TEST_KEY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasRemoteWorkspaceEntitlement(result.license)).toBe(true);
    expect(hasRemoteAgentEntitlement(result.license)).toBe(true);
  });

  it("denies when there is no license", () => {
    expect(hasRemoteWorkspaceEntitlement(null)).toBe(false);
  });
});
