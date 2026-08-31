/**
 * Session grant sent to prismnext-host. Laptop license is the authority.
 * Never include the raw activation key — the server only needs plan / expiry / features.
 */

import type { HostProGrant, LicenseSnapshot } from "./types";
import { isLicenseActive, isLicenseExpired } from "./license";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function licenseToHostProGrant(license: LicenseSnapshot | null | undefined): HostProGrant | null {
  if (!license || !isLicenseActive(license)) return null;
  return {
    plan: "pro",
    expiresAt: license.expiresAt ?? null,
    features: license.features,
    activatedAt: license.activatedAt,
    label: license.label ?? null,
  };
}

export function isHostProGrantActive(
  grant: HostProGrant | null | undefined,
  now = new Date(),
): boolean {
  if (!grant || grant.plan !== "pro") return false;
  return !isLicenseExpired(grant, now);
}

export function parseHostProGrant(value: unknown): HostProGrant | null {
  const rec = asRecord(value);
  if (!rec || rec.plan !== "pro") return null;
  if (typeof rec.activatedAt !== "string" || !rec.activatedAt.trim()) return null;
  const expiresAt = rec.expiresAt === undefined || rec.expiresAt === null
    ? null
    : typeof rec.expiresAt === "string" ? rec.expiresAt : null;
  if (rec.expiresAt !== undefined && rec.expiresAt !== null && expiresAt === null) return null;
  const features = Array.isArray(rec.features)
    ? rec.features.filter((item): item is string => typeof item === "string")
    : undefined;
  const label = rec.label === undefined || rec.label === null
    ? null
    : typeof rec.label === "string" ? rec.label : null;
  const grant: HostProGrant = {
    plan: "pro",
    expiresAt,
    features,
    activatedAt: rec.activatedAt.trim(),
    label,
  };
  return isHostProGrantActive(grant) ? grant : null;
}
