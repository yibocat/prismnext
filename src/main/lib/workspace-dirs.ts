import type { WorkspaceFolder } from "../../shared/workbench/workspace-folder";
import { readWorkbenchJson } from "../workbench/identity";

export const DEFAULT_WORKSPACE_FOLDERS: WorkspaceFolder[] = [
  { function: "manuscript", name: "manuscript", mainTex: "main.tex" },
];

function foldersFromWorkbench(projectRoot: string): WorkspaceFolder[] | null {
  const folders = readWorkbenchJson(projectRoot)?.workspace?.folders;
  if (!Array.isArray(folders) || folders.length === 0) return null;
  return folders as WorkspaceFolder[];
}

/** Read manuscript/folder layout from `.workbench/workbench.json` (D-14). */
export function readWorkspaceDirs(projectRoot: string): WorkspaceFolder[] {
  return foldersFromWorkbench(projectRoot) ?? DEFAULT_WORKSPACE_FOLDERS;
}
