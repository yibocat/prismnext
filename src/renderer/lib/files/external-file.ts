/** Prefix for file IDs that live outside the current project root. */
export const EXTERNAL_FILE_PREFIX = "__external__:";

export function isExternalFileId(id: string): boolean {
  return id.startsWith(EXTERNAL_FILE_PREFIX);
}

export function externalFileId(absolutePath: string): string {
  return `${EXTERNAL_FILE_PREFIX}${absolutePath}`;
}

export function resolveExternalPath(id: string): string | null {
  if (!isExternalFileId(id)) return null;
  return id.slice(EXTERNAL_FILE_PREFIX.length);
}
