import type { ProjectFile } from "@/stores/document-store";
import { Icon } from "@iconify/react";
import { getFileIconName } from "./file-icon-class";

export interface TreeNode {
  name: string;
  relativePath: string;
  type: "folder" | "file";
  file?: ProjectFile;
  children: TreeNode[];
}

export function getFileIcon(file: ProjectFile) {
  const icon = getFileIconName(file.name);
  return <Icon icon={icon} className="size-4 shrink-0" />;
}

/** A single visible row in the virtualized file tree. */
export interface FlatVisibleNode {
  /** Unique React key (relativePath, or synthetic for inline editing). */
  key: string;
  name: string;
  type: "folder" | "file";
  node: TreeNode;
  /** Visual indentation level (0 = root). */
  depth: number;
  /** Set only on synthetic inline-editing nodes. */
  editingType?: "file" | "folder";
  editingParentPath?: string;
}

/**
 * Flatten a recursive tree into a depth-first list of visible nodes.
 * Only expanded folders have their children included.
 * O(N) where N = number of visible nodes.
 */
export function flattenVisibleTree(
  nodes: TreeNode[],
  expandedFolders: Set<string>,
  depth = 0,
): FlatVisibleNode[] {
  const result: FlatVisibleNode[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      result.push({ key: node.relativePath, name: node.name, type: "folder", node, depth });
      if (expandedFolders.has(node.relativePath)) {
        result.push(...flattenVisibleTree(node.children, expandedFolders, depth + 1));
      }
    } else {
      result.push({ key: node.relativePath, name: node.name, type: "file", node, depth });
    }
  }
  return result;
}

export function buildFileTree(files: ProjectFile[], folders: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  function getOrCreateFolder(path: string): TreeNode[] {
    if (!path) return root;
    if (folderMap.has(path)) return folderMap.get(path)!.children;

    const parts = path.split("/");
    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join("/");
    const parentChildren = getOrCreateFolder(parentPath);

    const folder: TreeNode = { name, relativePath: path, type: "folder", children: [] };
    folderMap.set(path, folder);
    parentChildren.push(folder);
    return folder.children;
  }

  for (const folderPath of folders) {
    getOrCreateFolder(folderPath);
  }

  // Sort: root files first by type, then alphabetically
  // Sort: folders first, then files; within each group, alphabetically
  for (const file of files) {
    const parts = file.relativePath.split("/");
    const fileName = parts[parts.length - 1];
    const folderPath = parts.slice(0, -1).join("/");
    const parentChildren = getOrCreateFolder(folderPath);

    const node: TreeNode = { name: fileName, relativePath: file.relativePath, type: "file", file, children: [] };
    parentChildren.push(node);
  }

  // Sort each level: folders first, then files, alphabetically
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.type === "folder") sortTree(node.children);
    }
  }
  sortTree(root);

  return root;
}
