import { isRemoteProjectRoot, recoverRemoteAbs } from "../remote";

export type CompileAutoCompilePersistV1 = {
  autoCompileByRoot: Record<string, boolean>;
  localAutoCompileDefault: boolean;
};

/** Canonical persist key so collapsed `remote:/` leftovers match `remote://`. */
export function autoCompilePreferenceKey(projectRoot: string): string {
  return recoverRemoteAbs(projectRoot) ?? projectRoot;
}

/** Unspecified remote roots stay off; unspecified local roots follow `localDefault`. */
export function defaultAutoCompileForProjectRoot(
  projectRoot: string | null | undefined,
  localDefault = true,
): boolean {
  if (!projectRoot) return localDefault;
  if (isRemoteProjectRoot(projectRoot)) return false;
  return localDefault;
}

export function resolveAutoCompileForProjectRoot(
  byRoot: Record<string, boolean>,
  projectRoot: string | null | undefined,
  localDefault = true,
): boolean {
  if (!projectRoot) return localDefault;
  const key = autoCompilePreferenceKey(projectRoot);
  if (Object.prototype.hasOwnProperty.call(byRoot, key)) {
    return byRoot[key]!;
  }
  return defaultAutoCompileForProjectRoot(projectRoot, localDefault);
}

export function migrateCompileAutoCompilePersist(
  persisted: unknown,
  fromVersion: number,
): CompileAutoCompilePersistV1 {
  const raw = persisted && typeof persisted === "object"
    ? persisted as Record<string, unknown>
    : {};

  if (fromVersion >= 1) {
    return {
      autoCompileByRoot: isBooleanRecord(raw.autoCompileByRoot) ? raw.autoCompileByRoot : {},
      localAutoCompileDefault: raw.localAutoCompileDefault !== false,
    };
  }

  return {
    autoCompileByRoot: {},
    localAutoCompileDefault: raw.autoCompile !== false,
  };
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "boolean");
}
