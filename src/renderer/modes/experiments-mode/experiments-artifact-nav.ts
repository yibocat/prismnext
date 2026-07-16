/**
 * Artifact navigation helpers shared by the runs table + provenance inspector.
 *
 * Extracted so the "reveal + open an artifact in Files mode" sequence stays in
 * one place (chip click and the inspector's "Open in Files" button agree).
 */
import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { navigateFileTreeToPath } from "@/lib/files/navigate-file-tree";
import { resolveProjectRelativePath } from "@/lib/files/project-path";
import {
  artifactBasename,
  artifactPathCandidates,
  toProjectRelativeArtifact,
} from "../../../shared/artifact-path";

/** Build the project-relative path (island-relative → prefixed). */
export function artifactFullPath(path: string, workspacePath?: string): string {
  return toProjectRelativeArtifact(path, workspacePath);
}

/** Image file extensions we inline in chat tool cards / markdown. */
const IMAGE_ARTIFACT_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

export function isImageArtifactPath(path: string): boolean {
  const base = (path || "").replace(/\\/g, "/").split(/[?#]/)[0] ?? "";
  return IMAGE_ARTIFACT_EXT.test(base);
}

/** Project-relative paths for image artifacts (cwd = island workspacePath). */
export function resolveImageArtifactPaths(
  artifacts: string[],
  workspacePath?: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const a of artifacts) {
    if (!isImageArtifactPath(a)) continue;
    const full = artifactFullPath(a, workspacePath);
    if (!full || seen.has(full)) continue;
    seen.add(full);
    out.push(full);
  }
  return out;
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
  useLayoutStore.getState().activateMode("files");
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
