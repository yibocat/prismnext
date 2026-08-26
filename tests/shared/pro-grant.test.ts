import { describe, expect, it } from "vitest";
import {
  isHostProGrantActive,
  licenseToHostProGrant,
  parseHostProGrant,
  PRO_DEV_TEST_KEY,
  validateActivationKey,
} from "../../src/shared/pro";

describe("HostProGrant", () => {
  it("strips the activation key when converting a live license", () => {
    const checked = validateActivationKey(PRO_DEV_TEST_KEY);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const grant = licenseToHostProGrant(checked.license);
    expect(grant).toMatchObject({ plan: "pro", label: "Development" });
    expect(grant).not.toHaveProperty("key");
    expect(JSON.stringify(grant)).not.toContain(PRO_DEV_TEST_KEY);
  });

  it("does not grant from a missing or expired license", () => {
    expect(licenseToHostProGrant(null)).toBeNull();
    expect(licenseToHostProGrant({
      key: PRO_DEV_TEST_KEY,
      plan: "pro",
      activatedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
    })).toBeNull();
  });

  it("parses a wire grant and rejects expired or key-shaped junk", () => {
    expect(parseHostProGrant({
      plan: "pro",
      activatedAt: "2026-08-26T00:00:00.000Z",
      expiresAt: null,
      features: [],
    })).toEqual({
      plan: "pro",
      activatedAt: "2026-08-26T00:00:00.000Z",
      expiresAt: null,
      features: [],
      label: null,
    });
    expect(parseHostProGrant({
      plan: "pro",
      activatedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
    })).toBeNull();
    expect(parseHostProGrant({ key: PRO_DEV_TEST_KEY, plan: "none" })).toBeNull();
    expect(isHostProGrantActive({
      plan: "pro",
      activatedAt: "2026-08-26T00:00:00.000Z",
      expiresAt: null,
    })).toBe(true);
  });
});
