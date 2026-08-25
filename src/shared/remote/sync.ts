/** How the notebook mirrors remote files. Default for v1 is on-demand. */
export type RemoteSyncMode = "on-demand" | "live-mirror" | "online-only";

export const DEFAULT_REMOTE_SYNC_MODE: RemoteSyncMode = "on-demand";

export function isRemoteSyncMode(value: unknown): value is RemoteSyncMode {
  return value === "on-demand" || value === "live-mirror" || value === "online-only";
}
