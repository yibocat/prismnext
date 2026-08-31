import { encodeRemoteAbs, parseRemoteAbs } from "../../shared/remote";

export { encodeRemoteAbs };

export function firstRemoteAbs(
  ...candidates: Array<string | undefined | null>
): { profileId: string; abs: string } | null {
  for (const item of candidates) {
    if (!item) continue;
    const parsed = parseRemoteAbs(item);
    if (parsed) return parsed;
  }
  return null;
}

export function encodeRemoteScan(
  profileId: string,
  result: { files: Array<{ absolutePath: string; [key: string]: unknown }>; folders: string[] },
): typeof result {
  return {
    ...result,
    files: result.files.map((file) => ({
      ...file,
      absolutePath: encodeRemoteAbs(profileId, file.absolutePath) ?? file.absolutePath,
    })),
  };
}

const EMPTY_SCAN = { files: [] as Array<{ absolutePath: string }>, folders: [] as string[] };

/** Quiet replies while a remembered remote folder is focused before SSH is up. */
export function disconnectedHostFsProbe(method: string): unknown {
  if (method === "fs:exists" || method === "fs:isFile") return false;
  if (method === "fs:scan" || method === "fs:scanMetadata") return EMPTY_SCAN;
  return null;
}

/** These Host methods walk the open project. Connection alone is not a bind. */
export function hostFsNeedsProjectBind(method: string): boolean {
  return method === "fs:scan" || method === "fs:scanMetadata";
}

const LISTING_TTL_MS = 1_500;
const listingCache = new Map<string, { at: number; result: unknown }>();

export function hostListingCacheKey(profileId: string, method: string, path: string): string {
  return `${profileId}:${method}:${path}`;
}

export function readHostListingCache(key: string, now = Date.now()): unknown | null {
  const hit = listingCache.get(key);
  if (!hit || now - hit.at > LISTING_TTL_MS) return null;
  return hit.result;
}

export function writeHostListingCache(key: string, result: unknown, now = Date.now()): void {
  listingCache.set(key, { at: now, result });
}

export function invalidateHostListingCache(profileId?: string): void {
  if (!profileId) {
    listingCache.clear();
    return;
  }
  for (const key of [...listingCache.keys()]) {
    if (key.startsWith(`${profileId}:`)) listingCache.delete(key);
  }
}

export function toHostFsParams(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  for (const key of ["absPath", "rootPath", "oldPath", "newPath", "path", "cwd", "projectRoot"]) {
    const value = next[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) next[key] = parsed.abs;
  }
  return next;
}
