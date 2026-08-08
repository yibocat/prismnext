import { describe, expect, it } from "vitest";
import {
  PRO_DEV_TEST_KEY,
  isLicenseActive,
  isLicenseExpired,
  licenseGrantsFeature,
  normalizeLicenseKey,
  validateActivationKey,
} from "../../src/shared/pro";

describe("pro license helpers", () => {
  it("normalizes keys", () => {
    expect(normalizeLicenseKey("  prism-pro-dev-test  ")).toBe(PRO_DEV_TEST_KEY);
  });

  it("accepts the development test key", () => {
    const result = validateActivationKey("prism-pro-dev-test");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.license.plan).toBe("pro");
    expect(isLicenseActive(result.license)).toBe(true);
    expect(licenseGrantsFeature(result.license, "hello")).toBe(true);
  });

  it("rejects empty / malformed keys", () => {
    expect(validateActivationKey("").ok).toBe(false);
    expect(validateActivationKey("NOT-A-KEY").ok).toBe(false);
  });

  it("treats past expiresAt as expired", () => {
    expect(
      isLicenseExpired({ expiresAt: "2000-01-01T00:00:00.000Z" }, new Date("2020-01-01")),
    ).toBe(true);
    expect(
      isLicenseExpired({ expiresAt: null }, new Date("2020-01-01")),
    ).toBe(false);
  });
});
