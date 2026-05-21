import type { ProjectFile } from "@/stores/document-store";
import { FileTextIcon, ImageIcon, FileCodeIcon, FileIcon } from "lucide-react";

export interface TreeNode {
  name: string;
  relativePath: string;
  type: "folder" | "file";
  file?: ProjectFile;
  children: TreeNode[];
}

export function getFileIcon(file: ProjectFile) {
  if (file.type === "image") return <ImageIcon className="size-3.5 shrink-0" />;
  if (file.type === "style") return <FileCodeIcon className="size-3.5 shrink-0" />;
  if (file.type === "other") return <FileIcon className="size-3.5 shrink-0" />;
  return <FileTextIcon className="size-3.5 shrink-0" />;
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
