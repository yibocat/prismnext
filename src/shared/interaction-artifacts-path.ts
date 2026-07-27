/**
 * Path helpers for Interaction artifacts under `.prismnext/artifacts/`.
 * Only host-managed files (spec + scene entry scripts) are hard-denied for
 * generic write/edit — sidecar resources under the same id stay writable.
 */

const ARTIFACTS_SEG = ".prismnext/artifacts";
const THUMBNAIL_FILE = ".thumbnail.png";

function normalizePath(filePath: string): string {
  return (filePath || "").trim().replace(/\\/g, "/");
}

/** Host-generated thumbnail (offscreen-rendered `figure.plotly`/`instrument` screenshot). */
export function interactionThumbnailRelPath(id: string): string {
  return `${ARTIFACTS_SEG}/${id.trim()}/${THUMBNAIL_FILE}`;
}

/** True when path is anywhere under `.prismnext/artifacts/` (any OS separators). */
export function isInteractionArtifactsPath(filePath: string): boolean {
  const p = normalizePath(filePath);
  if (!p) return false;
  const lower = p.toLowerCase();
  const idx = lower.indexOf(ARTIFACTS_SEG);
  if (idx < 0) return false;
  const after = lower.slice(idx + ARTIFACTS_SEG.length);
  return after === "" || after.startsWith("/");
}

/**
 * Host-managed Interaction files that must go through interaction-write:
 * - `.prismnext/artifacts/<id>/spec.json`
 * - `.prismnext/artifacts/<id>/*.{js,mjs,cjs}` (scene entry at artifact root only)
 *
 * Nested resources (e.g. `<id>/data/foo.csv`, `<id>/assets/a.png`) are NOT blocked.
 */
export function isInteractionManagedArtifactPath(filePath: string): boolean {
  const p = normalizePath(filePath);
  if (!p) return false;
  const lower = p.toLowerCase();
  const idx = lower.indexOf(ARTIFACTS_SEG);
  if (idx < 0) return false;
  const after = p.slice(idx + ARTIFACTS_SEG.length).replace(/^\/+/, "");
  // Expect exactly `<id>/<file>` — one slash, no deeper nesting.
  const parts = after.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  const file = parts[1]!;
  if (/^spec\.json$/i.test(file)) return true;
  return /\.(mjs|js|cjs)$/i.test(file);
}

export function interactionArtifactsWriteDeniedMessage(filePath?: string): string {
  const hint = filePath?.trim() ? ` (blocked: ${filePath.trim()})` : "";
  return (
    `Refused to write Interaction host files under .prismnext/artifacts/<id>/${hint}. ` +
    `Use interaction-write for spec.json and sceneSource (scene.js). ` +
    `Sidecar resources in subfolders (data/, assets/, …) may still use write/edit.`
  );
}
