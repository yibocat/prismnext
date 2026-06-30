import { useDocumentStore } from "@/stores/document-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  isLazyProjectFilePath,
  isSafeProjectRelativePath,
  normalizeProjectRoot,
  resolveProjectRelativePath,
} from "./project-path";
import { navigateFileTreeToPath } from "./navigate-file-tree";
import { openHiddenProjectFile } from "./open-project-path";

/** Join a directory path with a child name (project-relative). */
export function joinProjectPaths(base: string, name: string): string {
  const dir = base.replace(/\\/g, "/").replace(/\/+$/, "") || ".";
  const child = name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!child) return dir === "." ? "" : dir;
  if (dir === "." || dir === "") return child;
  return `${dir}/${child}`;
}

/** Normalize tool/chat file paths to a safe project-relative path. */
export function resolveChatFilePath(rawPath: string, projectRoot: string): string | null {
  let path = rawPath.trim().replace(/\\/g, "/");
  if (!path) return null;

  if (path.startsWith("file://")) {
    path = decodeURIComponent(path.slice("file://".length));
  }

  const root = normalizeProjectRoot(projectRoot);
  const rootPrefix = root.endsWith("/") ? root : `${root}/`;
  const pathLower = path.toLowerCase();
  const rootLower = root.toLowerCase();

  if (pathLower === rootLower) return null;
  if (pathLower.startsWith(rootLower + "/")) {
    path = path.slice(root.length).replace(/^\/+/, "");
  }

  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) {
    return null;
  }

  path = path.replace(/^\/+/, "");
  if (!isSafeProjectRelativePath(path)) return null;
  return path;
}

/** Expand RightArea and focus Files mode so chat file links are immediately visible. */
export function ensureRightAreaVisibleForFiles(): void {
  const layout = useLayoutStore.getState();
  layout.activateMode("files");
  // Maximize mode already gives RightArea full width with center collapsed — keep it.
  if (!layout.editorMaximized) {
    layout.requestRightAreaExpand();
  }
}

/**
 * Open a project file in RightArea Files (editor tab + Files tree reveal).
 * Returns false when the path cannot be resolved or the file is missing.
 */
export async function openProjectFileFromChat(
  rawPath: string,
  opts?: { pin?: boolean },
): Promise<boolean> {
  const raw = rawPath?.trim();
  if (!raw) return false;

  const docStore = useDocumentStore.getState();
  const projectRoot = docStore.projectRoot;
  if (!projectRoot) return false;

  ensureRightAreaVisibleForFiles();

  const relativePath = resolveChatFilePath(raw, projectRoot);
  if (!relativePath) {
    const normalized = raw.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
      await docStore.openExternalFile(normalized, { pin: opts?.pin ?? false });
      return true;
    }
    return false;
  }

  navigateFileTreeToPath(relativePath);

  if (isLazyProjectFilePath(relativePath)) {
    await openHiddenProjectFile(relativePath, { pin: opts?.pin ?? false });
    return true;
  }

  const name = relativePath.split("/").pop() || relativePath;
  const hasMeta =
    docStore.fileMetadata.has(relativePath)
    || docStore.files.some((f) => f.relativePath === relativePath || f.id === relativePath);

  if (!hasMeta) {
    const abs = resolveProjectRelativePath(projectRoot, relativePath);
    if (!abs) return false;
    try {
      const exists = await window.electronAPI.fsExists(abs);
      if (!exists) return false;
      const isFile = await window.electronAPI.fsIsFile(abs);
      if (!isFile) return false;
      await docStore.refreshFiles();
    } catch {
      return false;
    }
  }

  useRightPanelStore.getState().openFile(relativePath, relativePath, name, {
    pin: opts?.pin ?? false,
  });
  await docStore.openFile(relativePath);
  return true;
}

/** `path/file.ext:42` or `path/file.ext:42:match` from grep-style output. */
export function parseGrepResultLine(line: string): { path: string; line?: number } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.+?):(\d+)(?::(.*))?$/);
  if (!match) return null;

  const filePath = match[1].trim();
  if (!filePath || filePath === "-" || filePath.startsWith("http")) return null;

  return {
    path: filePath,
    line: Number.parseInt(match[2], 10) || undefined,
  };
}
