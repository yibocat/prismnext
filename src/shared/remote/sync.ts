/** How the notebook mirrors remote files. Default for v1 is on-demand. */
export type RemoteSyncMode = "on-demand" | "live-mirror" | "online-only";

export const DEFAULT_REMOTE_SYNC_MODE: RemoteSyncMode = "on-demand";

/** Skip a single file above this size unless the user forces it. */
export const DEFAULT_REMOTE_MAX_FILE_BYTES = 20 * 1024 * 1024;

export const DEFAULT_REMOTE_SYNC_EXCLUDES = [
  "venv",
  ".venv",
  "node_modules",
  ".git/objects",
] as const;

export function isRemoteSyncMode(value: unknown): value is RemoteSyncMode {
  return value === "on-demand" || value === "live-mirror" || value === "online-only";
}

/** live-mirror is a stored leftover — it does not watch files. Treat as on-demand. */
export function effectiveRemoteSyncMode(value: unknown): Exclude<RemoteSyncMode, "live-mirror"> {
  return value === "online-only" ? "online-only" : "on-demand";
}

export type RemoteSyncKind = "file" | "pdf" | "experiment" | "sessions" | "skills";

export interface RemoteSyncProgress {
  current: number;
  total: number;
  title: string;
  kind: RemoteSyncKind;
}

export interface RemoteSyncManifestEntry {
  relPath: string;
  size: number;
  sha256: string;
  mtimeMs: number;
}

export interface RemoteSyncManifest {
  version: 1;
  profileId: string;
  projectId: string;
  entries: Record<string, RemoteSyncManifestEntry>;
}

export type SessionMutatedAction = "rename" | "turn_finished" | "delete";

export interface SessionMutatedEvent {
  conversationId: string;
  projectId: string;
  updatedAt: string;
  action: SessionMutatedAction;
}

export function isSessionMutatedEvent(value: unknown): value is SessionMutatedEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return typeof rec.conversationId === "string"
    && typeof rec.projectId === "string"
    && typeof rec.updatedAt === "string"
    && (rec.action === "rename" || rec.action === "turn_finished" || rec.action === "delete");
}

export function shouldExcludeRemoteSyncPath(
  relPath: string,
  size = 0,
  opts?: { maxBytes?: number; excludes?: readonly string[] },
): { exclude: boolean; reason?: "exclude" | "too_large" } {
  const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const excludes = opts?.excludes ?? DEFAULT_REMOTE_SYNC_EXCLUDES;
  for (const raw of excludes) {
    const token = raw.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (!token) continue;
    if (
      norm === token
      || norm.startsWith(`${token}/`)
      || norm.includes(`/${token}/`)
      || norm.endsWith(`/${token}`)
    ) {
      return { exclude: true, reason: "exclude" };
    }
  }
  const maxBytes = opts?.maxBytes ?? DEFAULT_REMOTE_MAX_FILE_BYTES;
  if (size > maxBytes) return { exclude: true, reason: "too_large" };
  return { exclude: false };
}

/** Remote wins when its updatedAt is newer or equal. Invalid dates keep remote. */
export function remoteWinsSessionConflict(localUpdatedAt: string, remoteUpdatedAt: string): boolean {
  const local = Date.parse(localUpdatedAt);
  const remote = Date.parse(remoteUpdatedAt);
  if (!Number.isFinite(local)) return true;
  if (!Number.isFinite(remote)) return false;
  return remote >= local;
}

export const SESSION_MUTATED_CHANNEL = "session_mutated";
export const REMOTE_SYNC_PROGRESS_CHANNEL = "remote:syncProgress";
