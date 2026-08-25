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

export function toHostFsParams(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  for (const key of ["absPath", "rootPath", "oldPath", "newPath", "path"]) {
    const value = next[key];
    if (typeof value !== "string") continue;
    const parsed = parseRemoteAbs(value);
    if (parsed) next[key] = parsed.abs;
  }
  return next;
}
