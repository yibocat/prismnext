import type { ProjectFile } from "@/stores/document-store";
import type { GitFileItem, GitFilterMode } from "@/stores/git-store";
import {
  buildFileTree,
  flattenVisibleTree,
  type FlatVisibleNode,
  type TreeNode,
} from "@/lib/files/file-tree";

/** Unique tree key — MM split entries get separate leaves. */
export function gitFileTreeKey(file: GitFileItem): string {
  return file.splitView ? `${file.path}#${file.splitView}` : file.path;
}

export function filterGitFilesByMode(
  files: GitFileItem[],
  mode: GitFilterMode,
): GitFileItem[] {
  switch (mode) {
    case "staged":
      return files.filter((f) => f.staged);
    case "unstaged":
      return files.filter((f) => f.unstaged || f.untracked);
    case "all":
      return files;
  }
}

export function gitFilesToTreeInputs(files: GitFileItem[]): {
  pseudoFiles: ProjectFile[];
  folders: string[];
} {
  const folderSet = new Set<string>();
  const pseudoFiles: ProjectFile[] = [];

  for (const file of files) {
    const treeKey = gitFileTreeKey(file);
    const parts = file.path.split("/");
    const fileName = parts[parts.length - 1] || file.path;

    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join("/"));
    }

    pseudoFiles.push({
      id: file.id,
      name: fileName,
      relativePath: treeKey,
      absolutePath: treeKey,
      type: "other",
    });
  }

  return { pseudoFiles, folders: [...folderSet] };
}

export interface GitChangeFlatNode extends FlatVisibleNode {
  gitFileId?: string;
}

/** Build folder tree for changed files; leaves map 1:1 to GitFileItem.id. */
export function buildGitChangesTree(files: GitFileItem[]): TreeNode[] {
  const { pseudoFiles, folders } = gitFilesToTreeInputs(files);
  return buildFileTree(pseudoFiles, folders);
}

export function flattenGitChangesTree(
  files: GitFileItem[],
  expandedFolders: Set<string>,
): GitChangeFlatNode[] {
  const tree = buildGitChangesTree(files);
  const idByTreeKey = new Map(files.map((f) => [gitFileTreeKey(f), f.id]));

  return flattenVisibleTree(tree, expandedFolders).map((row) => ({
    ...row,
    gitFileId: row.type === "file" ? idByTreeKey.get(row.key) : undefined,
  }));
}

/** All folder paths that contain changed files (for default expand). */
export function collectGitChangeFolderPaths(files: GitFileItem[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }
  return [...folders];
}

export const GIT_CHANGES_SCROLL_SELECTOR = "[data-git-changes-scroll]";
export const GIT_COMMIT_SCROLL_SELECTOR = "[data-git-commit-scroll]";

/** Keep list scroll position — expand/collapse pushes content below, not above. */
export function preserveGitPanelScroll(
  selector: string,
  action: () => void,
): void {
  const scroller = document.querySelector(selector);
  const scrollTop = scroller?.scrollTop ?? 0;
  action();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (scroller) scroller.scrollTop = scrollTop;
    });
  });
}

export function preserveGitChangesScroll(action: () => void): void {
  preserveGitPanelScroll(GIT_CHANGES_SCROLL_SELECTOR, action);
}

export function preserveGitCommitScroll(action: () => void): void {
  preserveGitPanelScroll(GIT_COMMIT_SCROLL_SELECTOR, action);
}

/** Scroll only if the row is off-screen; never snap it to the top. */
export function scrollToGitChange(fileId: string): void {
  const el = document.getElementById(`git-change-${fileId}`);
  if (!el) return;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
