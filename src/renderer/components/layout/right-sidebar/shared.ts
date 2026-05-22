import type { AppMode } from "@/stores/layout-store";
import type { ProjectFile } from "@/stores/document-store";

export type SidebarMode = Exclude<AppMode, "chat"> | "all";

export const MODE_OPTIONS: { id: SidebarMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "manuscript", label: "Manuscript" },
  { id: "vault", label: "Vault" },
  { id: "zotero", label: "Zotero" },
  { id: "code", label: "Code" },
  { id: "assets", label: "Assets" },
  { id: "other", label: "Other" },
];

export const MODE_DIR: Record<SidebarMode, string> = {
  all: "",
  manuscript: "manuscript",
  vault: "vault",
  zotero: "zotero",
  code: "code",
  assets: "assets",
  other: "other",
};

export function filterFilesByMode(files: ProjectFile[], mode: SidebarMode): ProjectFile[] {
  if (mode === "all") return files;
  const dir = MODE_DIR[mode];
  const prefix = `${dir}/`;
  return files
    .filter((f) => f.relativePath.startsWith(prefix))
    .map((f) => ({ ...f, relativePath: f.relativePath.slice(dir.length + 1) }));
}

export function filterFoldersByMode(folders: string[], mode: SidebarMode): string[] {
  if (mode === "all") return folders;
  const dir = MODE_DIR[mode];
  const prefix = `${dir}/`;
  return folders
    .filter((f) => f.startsWith(prefix))
    .map((f) => f.slice(dir.length + 1));
}
