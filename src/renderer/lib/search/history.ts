/**
 * Per-project command-palette search history (localStorage, lightweight).
 * Stores unique recent queries with a timestamp; capped at 20 entries.
 */

const KEY_PREFIX = "prismnext:cmd-history:";
const MAX = 20;

export interface HistoryEntry {
  query: string;
  at: number;
}

function keyFor(projectRoot: string): string {
  return KEY_PREFIX + projectRoot;
}

export function getSearchHistory(projectRoot: string | null): HistoryEntry[] {
  if (!projectRoot) return [];
  try {
    const raw = localStorage.getItem(keyFor(projectRoot));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(projectRoot: string | null, query: string): void {
  const q = query.trim();
  if (!projectRoot || !q) return;
  try {
    const list = getSearchHistory(projectRoot).filter((e) => e.query !== q);
    list.unshift({ query: q, at: Date.now() });
    localStorage.setItem(keyFor(projectRoot), JSON.stringify(list.slice(0, MAX)));
  } catch {
    // ignore quota / private mode errors
  }
}

export function clearSearchHistory(projectRoot: string | null): void {
  if (!projectRoot) return;
  try {
    localStorage.removeItem(keyFor(projectRoot));
  } catch {
    // ignore
  }
}

export function removeSearchHistory(projectRoot: string | null, query: string): void {
  if (!projectRoot) return;
  try {
    const list = getSearchHistory(projectRoot).filter((e) => e.query !== query);
    localStorage.setItem(keyFor(projectRoot), JSON.stringify(list));
  } catch {
    // ignore
  }
}
