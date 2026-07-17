/**
 * Artifact navigation helpers shared by the runs table + provenance inspector.
 *
 * Extracted so the "reveal + open an artifact in Files mode" sequence stays in
 * one place (chip click and the inspector's "Open in Files" button agree).
 */
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { ensureRightAreaVisibleForFiles } from "@/lib/files/open-project-file";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import {
  artifactBasename,
  artifactPathCandidates,
  imagePathsForRunDisplay,
  isImageArtifactPath,
  resolveImageArtifactPathsForDisplay,
  toProjectRelativeArtifact,
} from "../../../shared/artifact-path";

export { isImageArtifactPath, imagePathsForRunDisplay };

/** Build the project-relative path (island-relative → prefixed). Open-in-Files only. */
export function artifactFullPath(path: string, workspacePath?: string): string {
  return toProjectRelativeArtifact(path, workspacePath);
}

/**
 * Project-relative paths for image embeds in chat tool cards.
 * Keeps as-declared paths (e.g. manuscript/…) — does NOT blind-join under the island.
 * Bare filenames still join workspace. Prefer {@link imagePathsForRunDisplay} when
 * the run has `artifactSnapshots`.
 */
export function resolveImageArtifactPaths(
  artifacts: string[],
  workspacePath?: string,
): string[] {
  return resolveImageArtifactPathsForDisplay(artifacts, workspacePath);
}

/**
 * Image paths to embed for a run: frozen snapshots first, else declared artifacts.
 */
export function resolveRunImagePathsForDisplay(
  run: {
    artifacts?: string[] | null;
    artifactSnapshots?: string[] | null;
  },
  workspacePath?: string,
): string[] {
  const preferred = imagePathsForRunDisplay({
    artifacts: run.artifacts,
    artifactSnapshots: run.artifactSnapshots,
  });
  // Snapshots are already project-relative under .prismnext/ — pass through.
  if ((run.artifactSnapshots?.length ?? 0) > 0) {
    return preferred;
  }
  return resolveImageArtifactPathsForDisplay(preferred, workspacePath);
}

/**
 * Pick the first candidate that exists on disk under the project root.
 * Falls back to a basename search, then the heuristic island join.
 */
export async function resolveExistingArtifactRel(
  path: string,
  workspacePath: string | undefined,
  projectRoot: string,
): Promise<string> {
  const fallback = artifactFullPath(path, workspacePath);
  for (const cand of artifactPathCandidates(path, workspacePath)) {
    const abs = resolveProjectRelativePath(projectRoot, cand);
    if (!abs) continue;
    try {
      const ok = await window.electronAPI.fsExists(abs);
      if (ok) return cand;
    } catch {
      // keep trying
    }
  }
  const base = artifactBasename(path);
  if (base) {
    try {
      const found = await window.electronAPI.fsFindByBasename(projectRoot, base);
      if (found) return found;
    } catch {
      // ignore
    }
  }
  return fallback;
}

/** Reveal + open an artifact path in Files mode and pin it in the right panel. */
export function openArtifactInFiles(fullPath: string): void {
  if (!fullPath) return;
  const fileName = fullPath.split("/").pop() ?? fullPath;
  ensureRightAreaVisibleForFiles();
  navigateFileTreeToPath(fullPath);
  useDocumentStore.getState().setActiveFile(fullPath);
  useRightPanelStore.getState().openFile(fullPath, fullPath, fileName, { pin: true });
}

/** Resolve (existence-aware) then open in Files. */
export async function openArtifactPathInFiles(
  path: string,
  workspacePath?: string,
): Promise<void> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) {
    openArtifactInFiles(artifactFullPath(path, workspacePath));
    return;
  }
  const rel = await resolveExistingArtifactRel(path, workspacePath, projectRoot);
  openArtifactInFiles(rel);
}
