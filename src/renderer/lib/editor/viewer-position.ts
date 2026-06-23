/**
 * Viewer position persistence — lightweight save/restore of scroll, page, and
 * cursor positions to localStorage, keyed by absolute file path.
 *
 * Survives app restarts. Each entry is just a few numbers — overhead is
 * negligible even with hundreds of files.
 *
 * With the CSS keep-alive pattern (RightPane / RightMainArea), in-session
 * state is preserved naturally without this layer. This module handles the
 * cross-session case: reopening a project and restoring where you left off.
 */

const STORAGE_PREFIX = "prism-vp:";

export interface ViewerPosition {
  /** PDF: 1-based page number currently visible */
  pdfPage?: number;
  /** PDF: scroll offset within the virtualized page list (pixels) */
  pdfScrollOffset?: number;
  /** CodeMirror: absolute cursor position (offset into document) */
  cursorPos?: number;
  /** CodeMirror: scrollTop of the editor viewport */
  scrollTop?: number;
  /** Generic: scrollTop of a plain scroll container */
  containerScrollTop?: number;
  /** Last-update timestamp (Date.now) */
  ts?: number;
}

function storageKey(filePath: string): string {
  return STORAGE_PREFIX + filePath;
}

/** Merge partial position into the saved state for `filePath`. */
export function saveViewerPosition(
  filePath: string,
  pos: Partial<ViewerPosition>,
): void {
  if (!filePath) return;
  try {
    const key = storageKey(filePath);
    const existing = loadViewerPosition(filePath);
    const merged: ViewerPosition = { ...existing, ...pos, ts: Date.now() };
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/** Read the last-saved position for `filePath`, or null if never saved. */
export function loadViewerPosition(
  filePath: string,
): ViewerPosition | null {
  if (!filePath) return null;
  try {
    const raw = localStorage.getItem(storageKey(filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewerPosition;
    // Basic shape validation
    if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Remove saved position for a file (e.g. when tab is closed). */
export function clearViewerPosition(filePath: string): void {
  if (!filePath) return;
  try {
    localStorage.removeItem(storageKey(filePath));
  } catch {
    // ignore
  }
}
