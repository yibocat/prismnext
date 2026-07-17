/**
 * Viewer position persistence — scroll / page / cursor, keyed by path.
 *
 * In-memory map is the source of truth for in-session restore (swap / view-mode).
 * localStorage is a debounced mirror for cross-session reopen.
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

const memory = new Map<string, ViewerPosition>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function storageKey(filePath: string): string {
  return STORAGE_PREFIX + filePath;
}

function readStorage(filePath: string): ViewerPosition | null {
  try {
    const raw = localStorage.getItem(storageKey(filePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewerPosition;
    if (typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(filePath: string, pos: ViewerPosition): void {
  try {
    localStorage.setItem(storageKey(filePath), JSON.stringify(pos));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/** Merge partial position into memory immediately; persist to localStorage shortly after. */
export function saveViewerPosition(
  filePath: string,
  pos: Partial<ViewerPosition>,
): void {
  if (!filePath) return;
  const existing = memory.get(filePath) ?? readStorage(filePath) ?? {};
  const merged: ViewerPosition = { ...existing, ...pos, ts: Date.now() };
  memory.set(filePath, merged);

  const prev = persistTimers.get(filePath);
  if (prev) clearTimeout(prev);
  persistTimers.set(
    filePath,
    setTimeout(() => {
      persistTimers.delete(filePath);
      writeStorage(filePath, merged);
    }, 250),
  );
}

/** Flush pending localStorage writes (call before risky unmounts if needed). */
export function flushViewerPosition(filePath?: string): void {
  const keys = filePath ? [filePath] : [...persistTimers.keys()];
  for (const key of keys) {
    const timer = persistTimers.get(key);
    if (timer) clearTimeout(timer);
    persistTimers.delete(key);
    const pos = memory.get(key);
    if (pos) writeStorage(key, pos);
  }
}

/** Read last-saved position (memory first, then localStorage). */
export function loadViewerPosition(
  filePath: string,
): ViewerPosition | null {
  if (!filePath) return null;
  const mem = memory.get(filePath);
  if (mem) return mem;
  const stored = readStorage(filePath);
  if (stored) memory.set(filePath, stored);
  return stored;
}

/** Remove saved position for a file (e.g. when tab is closed). */
export function clearViewerPosition(filePath: string): void {
  if (!filePath) return;
  memory.delete(filePath);
  const timer = persistTimers.get(filePath);
  if (timer) clearTimeout(timer);
  persistTimers.delete(filePath);
  try {
    localStorage.removeItem(storageKey(filePath));
  } catch {
    // ignore
  }
}
