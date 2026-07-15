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

/** Build the project-relative full path (prefix workspace unless already prefixed). */
export function artifactFullPath(path: string, workspacePath?: string): string {
  const p = (path || "").replace(/\\/g, "/").replace(/^\.\//, "");
  const ws = (workspacePath || "").replace(/\\/g, "/").replace(/\/$/, "");
  if (!p) return ws;
  if (!ws || p.startsWith(`${ws}/`) || p === ws) return p;
  return `${ws}/${p}`;
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

/** Reveal + open an artifact path in Files mode and pin it in the right panel. */
export function openArtifactInFiles(fullPath: string): void {
  if (!fullPath) return;
  const fileName = fullPath.split("/").pop() ?? fullPath;
  useLayoutStore.getState().activateMode("files");
  navigateFileTreeToPath(fullPath);
  useDocumentStore.getState().setActiveFile(fullPath);
  useRightPanelStore.getState().openFile(fullPath, fullPath, fileName, { pin: true });
}
