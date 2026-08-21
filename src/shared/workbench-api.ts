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

export interface WorkbenchHomeSettings {
  defaultProjectId: string | null;
  workbenchProjectIds: string[];
}

export interface WorkbenchProjectMeta {
  lastPath: string;
  displayName?: string;
}
