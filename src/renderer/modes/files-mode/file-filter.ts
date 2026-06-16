import type { ProjectFile } from "@/stores/document-store";

/** The only two view modes the file sidebar supports.
 *  "all" = full project tree; "manuscript" = scoped to the manuscript directory. */
export type SidebarMode = "all" | "manuscript";

/** Resolve a filter mode to the filesystem directory prefix.
 *  "all" → empty string (no prefix filtering)
 *  "manuscript" → the configured manuscript directory name */
export function getModeDir(mode: SidebarMode, modeDir: string): string {
  if (mode === "manuscript") return modeDir;
  return "";
}

export function filterFilesByMode(
  files: ProjectFile[],
  mode: SidebarMode,
  modeDir: string,
): ProjectFile[] {
  if (mode === "all") return files;
  const prefix = `${getModeDir(mode, modeDir)}/`;
  return files
    .filter((f) => f.relativePath.startsWith(prefix))
    .map((f) => ({ ...f, relativePath: f.relativePath.slice(prefix.length) }));
}

export function filterFoldersByMode(
  folders: string[],
  mode: SidebarMode,
  modeDir: string,
): string[] {
  if (mode === "all") return folders;
  const prefix = `${getModeDir(mode, modeDir)}/`;
  return folders
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(prefix.length));
}
