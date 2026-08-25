/**
 * Open-core Pro license + feature ids (shared main ↔ renderer).
 *
 * Do not pre-list product feature ids here. Add them when a Pro SKU ships.
 * Remote Workspace ids (`workspace.remote`, `agent.remote`) live in
 * `src/shared/remote/entitlements.ts` until that SKU is listed.
 */

/** Feature entitlement ids — grow with real products; never rename shipped ids. */
export type ProFeatureId = string;

/** Known ids at build time (may be empty while Host is minimal). */
export const PRO_FEATURE_IDS = [] as const satisfies readonly ProFeatureId[];

export type ProLicensePlan = "pro" | "none";

/** Persisted / IPC license snapshot (no secrets beyond the key itself). */
export interface LicenseSnapshot {
  /** Raw activation key as entered (trimmed). */
  key: string;
  plan: ProLicensePlan;
  /** ISO date; omit / null = no expiry (lifetime / until revoked). */
  expiresAt?: string | null;
  /** Optional human label from the issuer (e.g. email domain). */
  label?: string | null;
  /** When the key was activated on this machine. */
  activatedAt: string;
  /**
   * Entitlements granted by this license.
   * Empty + plan === "pro" means "all known Pro features" for early builds.
   */
  features?: ProFeatureId[];
}

export type ProLoadStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "skipped"
  | "error";

export type ProLoadSkipReason =
  | "no-license"
  | "license-expired"
  | "pro-module-absent"
  | "register-failed";

export interface ProLoadResult {
  status: Exclude<ProLoadStatus, "idle" | "loading">;
  reason?: ProLoadSkipReason;
  errorMessage?: string;
}

/** Activation attempt result from main. */
export type ActivateLicenseResult =
  | { ok: true; license: LicenseSnapshot }
  | { ok: false; error: "invalid" | "expired" | "empty" };
