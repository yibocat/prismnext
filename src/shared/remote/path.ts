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

/**
 * `path.normalize` / `path.resolve` collapse `remote://alias/abs` to
 * `remote:/alias/abs` or `${cwd}/remote:/alias/abs`. Recover the URI so a
 * laptop mkdir cannot treat the Host path as a folder in this repo.
 */
function coerceRemoteUri(raw: string): string | null {
  const normalized = raw.replace(/\\/g, "/");
  if (normalized.startsWith(REMOTE_ROOT_SCHEME)) return normalized;
  const marker = "remote:/";
  const idx = normalized.indexOf(marker);
  if (idx < 0) return null;
  const fromMarker = normalized.slice(idx);
  if (fromMarker.startsWith(REMOTE_ROOT_SCHEME)) return fromMarker;
  return `${REMOTE_ROOT_SCHEME}${fromMarker.slice(marker.length)}`;
}

export function parseRemoteAbs(value: string): { profileId: string; abs: string } | null {
  const raw = coerceRemoteUri(value.trim());
  if (!raw) return null;
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

/** Canonical `remote://alias/abs`, including collapsed `remote:/` leftovers. */
export function recoverRemoteAbs(value: string): string | null {
  const parsed = parseRemoteAbs(value);
  if (!parsed) return null;
  return encodeRemoteAbs(parsed.profileId, parsed.abs);
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

const HOST_EVENT_PATH_KEYS = ["projectRoot", "targetRoot", "sourceRoot"] as const;

/** Host events carry POSIX abs; the renderer compares `remote://alias/abs`. */
export function rewriteHostEventPaths(payload: unknown, profileId: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rec = payload as Record<string, unknown>;
  const next = { ...rec };
  let changed = false;
  for (const key of HOST_EVENT_PATH_KEYS) {
    const value = next[key];
    if (typeof value !== "string") continue;
    if (parseRemoteAbs(value)) continue;
    const encoded = encodeRemoteAbs(profileId, value);
    if (!encoded) continue;
    next[key] = encoded;
    changed = true;
  }
  return changed ? next : payload;
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
