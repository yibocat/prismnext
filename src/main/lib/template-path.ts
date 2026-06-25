import { normalize, isAbsolute } from "node:path";

/** Reject paths that escape the manuscript base directory. */
export function assertSafeRelativePath(relativePath: string): void {
  if (!relativePath || typeof relativePath !== "string") {
    throw new Error("Template path must be a non-empty string");
  }
  if (relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new Error(`Unsafe template path: ${relativePath}`);
  }
  const normalized = normalize(relativePath).replace(/\\/g, "/");
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe template path: ${relativePath}`);
  }
  if (isAbsolute(normalized)) {
    throw new Error(`Unsafe template path: ${relativePath}`);
  }
}

export function assertSafeRelativePaths(paths: string[]): void {
  for (const p of paths) {
    assertSafeRelativePath(p);
  }
}

/**
 * Parse `timestamp_sourceId_to_targetId` backup directory labels (legacy).
 */
export function parseBackupLabelIds(label: string): {
  sourceTemplateId?: string;
  targetTemplateId?: string;
} {
  const firstUnderscore = label.indexOf("_");
  if (firstUnderscore < 0) return {};
  const rest = label.slice(firstUnderscore + 1);
  const toIdx = rest.lastIndexOf("_to_");
  if (toIdx <= 0) {
    if (rest.startsWith("first_use_")) {
      return { targetTemplateId: rest.slice("first_use_".length) };
    }
    return {};
  }
  return {
    sourceTemplateId: rest.slice(0, toIdx),
    targetTemplateId: rest.slice(toIdx + 4),
  };
}
