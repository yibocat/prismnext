/**
 * Remote project roots cannot be laptop absolute paths.
 * Persist and pass `remote://<alias>/posix/abs` so main can route without
 * treating `/home/ubuntu/…` as a file on this Mac.
 */

export const REMOTE_ROOT_SCHEME = "remote://";

export function normalizePosixAbs(path: string): string | null {
  const raw = path.replace(/\\/g, "/").trim();
  if (!raw.startsWith("/")) return null;
  const parts: string[] = [];
  for (const segment of raw.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return `/${parts.join("/")}`;
}

export function posixContained(root: string, candidate: string): string | null {
  const base = normalizePosixAbs(root);
  const path = normalizePosixAbs(candidate);
  if (!base || !path) return null;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return null;
}

export function encodeRemoteAbs(profileId: string, posixAbs: string): string | null {
  const alias = profileId.trim();
  const abs = normalizePosixAbs(posixAbs);
  if (!alias || !abs) return null;
  return `${REMOTE_ROOT_SCHEME}${encodeURIComponent(alias)}${abs}`;
}

export function parseRemoteAbs(value: string): { profileId: string; abs: string } | null {
  const raw = value.trim();
  if (!raw.startsWith(REMOTE_ROOT_SCHEME)) return null;
  const rest = raw.slice(REMOTE_ROOT_SCHEME.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return null;
  try {
    const profileId = decodeURIComponent(rest.slice(0, slash));
    const abs = normalizePosixAbs(rest.slice(slash));
    if (!profileId || !abs) return null;
    return { profileId, abs };
  } catch {
    return null;
  }
}

export function isRemoteProjectRoot(value: string | null | undefined): boolean {
  return Boolean(value && parseRemoteAbs(value));
}

export function remoteHomeFromAppHome(appHome: string): string | null {
  const abs = normalizePosixAbs(appHome);
  if (!abs) return null;
  if (abs.endsWith("/.prismnext")) return abs.slice(0, -"/.prismnext".length) || "/";
  const slash = abs.lastIndexOf("/");
  return slash <= 0 ? "/" : abs.slice(0, slash);
}

export function joinPosixSegment(parent: string, name: string): string | null {
  const base = normalizePosixAbs(parent);
  const segment = name.trim();
  if (!base || !segment || segment.includes("/") || segment.includes("\\")) return null;
  if (segment === "." || segment === "..") return null;
  return base === "/" ? `/${segment}` : `${base}/${segment}`;
}

export type RemoteDirKind = "dir" | "file";

export interface RemoteDirEntry {
  name: string;
  kind: RemoteDirKind;
}

export interface RemoteDirListing {
  path: string;
  parent: string | null;
  entries: RemoteDirEntry[];
}

export function isRemoteDirListing(value: unknown): value is RemoteDirListing {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  if (typeof rec.path !== "string") return false;
  if (rec.parent !== null && typeof rec.parent !== "string") return false;
  if (!Array.isArray(rec.entries)) return false;
  return rec.entries.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return typeof item.name === "string" && (item.kind === "dir" || item.kind === "file");
  });
}
