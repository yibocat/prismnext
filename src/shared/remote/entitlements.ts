import { licenseGrantsFeature, type LicenseSnapshot } from "../pro";

/**
 * Pro feature ids for Remote Workspace (D17).
 * Kept here — not in `PRO_FEATURE_IDS` — until the SKU ships a store listing.
 * `licenseGrantsFeature`: empty `features` on an active Pro license grants all ids
 * (including the development key `PRISM-PRO-DEV-TEST`).
 */
export const WORKSPACE_REMOTE_FEATURE = "workspace.remote";
export const AGENT_REMOTE_FEATURE = "agent.remote";

export function hasRemoteWorkspaceEntitlement(
  license: LicenseSnapshot | null | undefined,
  now = new Date(),
): boolean {
  return licenseGrantsFeature(license, WORKSPACE_REMOTE_FEATURE, now);
}

export function hasRemoteAgentEntitlement(
  license: LicenseSnapshot | null | undefined,
  now = new Date(),
): boolean {
  return licenseGrantsFeature(license, AGENT_REMOTE_FEATURE, now);
}
