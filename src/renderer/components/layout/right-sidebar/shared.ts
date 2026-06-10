import type { ProjectFile } from "@/stores/document-store";

export type SidebarMode = string; // "all" | "manuscript" | <any project subdirectory>

/** Modes that always appear regardless of project structure. */
const BUILTIN_MODES: { id: SidebarMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "manuscript", label: "Manuscript" },
];

/** Discover available sidebar modes from the project's top-level directories.
 *  Always includes "all" and "manuscript". Other modes are derived from
 *  subdirectories of the project root (excluding hidden dirs and .prismnext). */
export function getModeOptions(projectDirs: string[]): { id: SidebarMode; label: string }[] {
  const seen = new Set(["all", "manuscript"]);
  const options = [...BUILTIN_MODES];

  for (const dir of projectDirs) {
    // Skip hidden dirs, .prismnext, and the manuscript dir itself
    if (dir.startsWith(".")) continue;
    if (dir === "manuscript") continue; // handled by builtin
    if (seen.has(dir)) continue;
    seen.add(dir);
    options.push({
      id: dir,
      label: dir.charAt(0).toUpperCase() + dir.slice(1),
    });
  }

  return options;
}

/** Get the filesystem directory name for a sidebar mode.
 *  "all" → no filter, "manuscript" → manuscript dir, anything else → itself. */
export function getModeDir(mode: SidebarMode, manuscriptDir: string): string {
  if (mode === "all") return "";
  if (mode === "manuscript") return manuscriptDir;
  return mode;
}

export function filterFilesByMode(
  files: ProjectFile[],
  mode: SidebarMode,
  manuscriptDir: string,
): ProjectFile[] {
  if (mode === "all") return files;
  const dir = getModeDir(mode, manuscriptDir);
  const prefix = `${dir}/`;
  return files
    .filter((f) => f.relativePath.startsWith(prefix))
    .map((f) => ({ ...f, relativePath: f.relativePath.slice(dir.length + 1) }));
}

export function filterFoldersByMode(
  folders: string[],
  mode: SidebarMode,
  manuscriptDir: string,
): string[] {
  if (mode === "all") return folders;
  const dir = getModeDir(mode, manuscriptDir);
  const prefix = `${dir}/`;
  return folders
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(dir.length + 1));
}
