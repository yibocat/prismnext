import { parseRemoteAbs } from "./path";

/**
 * Project identity that is not “a local absolute path”.
 * v1: local disk or a remote folder behind an SSH Host connection.
 */

export interface LocalProjectHandle {
  kind: "local";
  projectId: string;
  projectRoot: string;
}

export interface RemoteProjectHandle {
  kind: "remote";
  projectId: string;
  profileId: string;
  /** POSIX absolute path on the remote machine. */
  remoteRoot: string;
  connectionId: string;
}

export type ProjectHandle = LocalProjectHandle | RemoteProjectHandle;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseProjectHandle(value: unknown): ProjectHandle | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const projectId = nonEmptyString(rec.projectId);
  if (!projectId) return null;

  if (rec.kind === "local") {
    const projectRoot = nonEmptyString(rec.projectRoot);
    return projectRoot ? { kind: "local", projectId, projectRoot } : null;
  }

  if (rec.kind === "remote") {
    const profileId = nonEmptyString(rec.profileId);
    const remoteRoot = nonEmptyString(rec.remoteRoot);
    const connectionId = nonEmptyString(rec.connectionId);
    if (!profileId || !remoteRoot || !connectionId) return null;
    return { kind: "remote", projectId, profileId, remoteRoot, connectionId };
  }

  return null;
}

export function isLocalProjectHandle(value: unknown): value is LocalProjectHandle {
  return parseProjectHandle(value)?.kind === "local";
}

export function isRemoteProjectHandle(value: unknown): value is RemoteProjectHandle {
  return parseProjectHandle(value)?.kind === "remote";
}

/** Workbench focus id + persisted lastPath → handle. Remote needs a live connectionId. */
export function projectHandleFromFocus(input: {
  projectId: string;
  lastPath: string;
  connectionId?: string;
}): ProjectHandle | null {
  const projectId = input.projectId.trim();
  const lastPath = input.lastPath.trim();
  if (!projectId || !lastPath) return null;
  const remote = parseRemoteAbs(lastPath);
  if (remote) {
    const connectionId = input.connectionId?.trim();
    if (!connectionId) return null;
    return {
      kind: "remote",
      projectId,
      profileId: remote.profileId,
      remoteRoot: remote.abs,
      connectionId,
    };
  }
  return { kind: "local", projectId, projectRoot: lastPath };
}
