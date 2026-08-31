/**
 * Workbench home settings and IPC shapes.
 * Source of truth: ~/.prismnext/settings.json.
 */

import type { ProjectDirectoryIndex } from "./project-directory-index";

export interface WorkbenchProjectMember {
  id: string;
  lastPath: string;
  displayName: string;
}

export interface WorkbenchState {
  defaultProjectId: string;
  defaultLastPath: string;
  workbenchProjectIds: string[];
  members: WorkbenchProjectMember[];
  /** Last-known roots, including removed workbench members (RW-6.2). */
  projectDirectoryById?: ProjectDirectoryIndex;
}

/** `workbench:openFolder` — includes the paper lastPath after worktree remap. */
export interface WorkbenchOpenResult extends WorkbenchState {
  openedProjectId: string;
  openedLastPath: string;
}

export function workbenchStateFromOpenResult(result: WorkbenchOpenResult | WorkbenchState): WorkbenchState {
  const { openedProjectId: _id, openedLastPath: _path, ...state } = result as WorkbenchOpenResult;
  return state;
}

/** Never guess `members[members.length - 1]`. Missing opened path → requested path. */
export function focusPathAfterOpenFolder(
  openedLastPath: string | undefined | null,
  requestedPath: string,
): string {
  const opened = openedLastPath?.trim();
  return opened || requestedPath;
}

export interface WorkbenchHomeSettings {
  defaultProjectId: string | null;
  workbenchProjectIds: string[];
  projectDirectoryById?: ProjectDirectoryIndex;
}

export interface WorkbenchProjectMeta {
  lastPath: string;
  displayName?: string;
}

export function moveListItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (
    from === to
    || from < 0
    || to < 0
    || from >= list.length
    || to >= list.length
  ) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...list];
  next.splice(to, 0, item);
  return next;
}

/** True when both lists have the same ids (order ignored). */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  return b.every((id) => seen.has(id));
}

/**
 * Apply a new visible-member order onto the full workbench id list,
 * leaving ids that are not in the visible set where they are.
 */
export function applyVisibleIdReorder(
  fullIds: readonly string[],
  nextVisibleIds: readonly string[],
): string[] {
  const visible = new Set(nextVisibleIds);
  const queue = [...nextVisibleIds];
  return fullIds.map((id) => (visible.has(id) ? queue.shift() ?? id : id));
}
