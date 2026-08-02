import { useEffect, useMemo, useState } from "react";
import type { ProjectFile } from "@/stores/document-store";
import { useDocumentStore } from "@/stores/document-store";
import { isExternalFileId } from "./external-file";

/** Project files plus any open external files for @mention picker. */
export function getMentionableFiles(
  projectFiles: ProjectFile[],
  fileMetadata: Map<string, {
    relativePath: string;
    absolutePath: string;
    name: string;
    type: ProjectFile["type"];
    isExternal?: boolean;
  }>,
): ProjectFile[] {
  const ids = new Set(projectFiles.map((f) => f.id));
  const external: ProjectFile[] = [];

  for (const [id, meta] of fileMetadata) {
    if (!meta.isExternal || ids.has(id)) continue;
    external.push({
      id,
      name: meta.name,
      relativePath: meta.absolutePath,
      absolutePath: meta.absolutePath,
      type: meta.type,
    });
  }

  return [...projectFiles, ...external];
}

/**
 * Mentionable files for @ picker — excludes paths matched by `.gitignore`
 * (same as command palette / Files). External tabs are always kept.
 */
export function useMentionableFiles(
  projectFiles: ProjectFile[],
  fileMetadata: Map<string, {
    relativePath: string;
    absolutePath: string;
    name: string;
    type: ProjectFile["type"];
    isExternal?: boolean;
  }>,
): ProjectFile[] {
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const base = useMemo(
    () => getMentionableFiles(projectFiles, fileMetadata),
    [projectFiles, fileMetadata],
  );
  const [ignoredPaths, setIgnoredPaths] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!projectRoot) {
      setIgnoredPaths(new Set());
      return;
    }
    const projectOnly = base.filter((f) => !isExternalFileId(f.id));
    if (projectOnly.length === 0) {
      setIgnoredPaths(new Set());
      return;
    }
    let cancelled = false;
    const paths = projectOnly.map((f) => f.relativePath);
    window.electronAPI
      .gitCheckIgnore(projectRoot, paths)
      .then((ignored) => {
        if (!cancelled) setIgnoredPaths(new Set(ignored));
      })
      .catch(() => {
        if (!cancelled) setIgnoredPaths(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [projectRoot, base]);

  return useMemo(
    () => base.filter((f) => isExternalFileId(f.id) || !ignoredPaths.has(f.relativePath)),
    [base, ignoredPaths],
  );
}

export function mentionFileLabel(file: ProjectFile): string {
  return isExternalFileId(file.id) ? file.absolutePath : file.relativePath;
}

/** Visible @file token label — filename only (full path stays in `filePath`). */
export function mentionFileDisplayLabel(file: ProjectFile): string {
  const path = mentionFileLabel(file);
  return path.split(/[/\\]/).pop() || path;
}

export function projectPathBasename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}
