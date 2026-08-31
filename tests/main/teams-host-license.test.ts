import { afterEach, describe, expect, it } from "vitest";
import {
  applyHostProGrant,
  enableHostLicenseSessionMode,
  licenseGrants,
  __resetHostLicenseSessionForTests,
} from "../../src/main/teams/teams-license";

describe("Host session license", () => {
  afterEach(() => {
    __resetHostLicenseSessionForTests();
  });

  it("starts locked in Host session mode and follows the laptop grant", () => {
    enableHostLicenseSessionMode();
    expect(licenseGrants()).toBe(false);
    applyHostProGrant({
      plan: "pro",
      activatedAt: new Date().toISOString(),
      expiresAt: null,
    });
    expect(licenseGrants()).toBe(true);
    expect(licenseGrants("any-feature")).toBe(true);
    applyHostProGrant(null);
    expect(licenseGrants()).toBe(false);
  });

  it("treats an expired grant as revoked", () => {
    enableHostLicenseSessionMode();
    applyHostProGrant({
      plan: "pro",
      activatedAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-02T00:00:00.000Z",
    });
    expect(licenseGrants()).toBe(false);
  });
});
