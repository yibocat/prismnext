/**
 * Workbench home settings and IPC shapes.
 * Source of truth: ~/.prismnext/settings.json (not electron-store lastProjectPath).
 */

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
}

export interface WorkbenchProjectMeta {
  lastPath: string;
  displayName?: string;
}
