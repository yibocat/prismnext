import type { LicenseSnapshot, ProFeatureId } from "./types";
import { PRO_FEATURE_IDS } from "./types";

/** Local/dev test key — replace with signed keys when MoR issuing is wired. */
export const PRO_DEV_TEST_KEY = "PRISM-PRO-DEV-TEST";

const KEY_PATTERN = /^PRISM-PRO-[A-Z0-9-]{4,64}$/i;

export function normalizeLicenseKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isLicenseExpired(
  license: Pick<LicenseSnapshot, "expiresAt">,
  now = new Date(),
): boolean {
  if (!license.expiresAt) return false;
  const t = Date.parse(license.expiresAt);
  if (Number.isNaN(t)) return true;
  return t <= now.getTime();
}

export function isLicenseActive(
  license: LicenseSnapshot | null | undefined,
  now = new Date(),
): boolean {
  if (!license || license.plan !== "pro") return false;
  if (!license.key) return false;
  return !isLicenseExpired(license, now);
}

/**
 * Early validator: format + known test key.
 * Production should verify a signed payload (JWT / Ed25519) and fill features.
 */
export function validateActivationKey(
  raw: string,
  now = new Date(),
):
  | { ok: true; license: LicenseSnapshot }
  | { ok: false; error: "invalid" | "expired" | "empty" } {
  const key = normalizeLicenseKey(raw);
  if (!key) return { ok: false, error: "empty" };
  if (!KEY_PATTERN.test(key)) return { ok: false, error: "invalid" };

  // Dev / QA key — no expiry, all features.
  if (key === PRO_DEV_TEST_KEY) {
    return {
      ok: true,
      license: {
        key,
        plan: "pro",
        expiresAt: null,
        label: "Development",
        activatedAt: now.toISOString(),
        features: [...PRO_FEATURE_IDS],
      },
    };
  }

  // Placeholder accept: any well-formed PRISM-PRO-* key unlocks Pro.
  // Swap for cryptographic verify before public sale.
  return {
    ok: true,
    license: {
      key,
      plan: "pro",
      expiresAt: null,
      label: null,
      activatedAt: now.toISOString(),
      features: [...PRO_FEATURE_IDS],
    },
  };
}

export function licenseGrantsFeature(
  license: LicenseSnapshot | null | undefined,
  feature: ProFeatureId | string,
  now = new Date(),
): boolean {
  if (!isLicenseActive(license, now)) return false;
  const list = license!.features;
  if (!list || list.length === 0) return true;
  return list.includes(feature as ProFeatureId);
}
