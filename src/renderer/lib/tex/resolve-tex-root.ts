import type { ProjectFile } from "@/stores/document-store";

/**
 * Resolve the % !TEX root magic comment chain.
 * Returns the root file's relative path, or null if not found.
 */
export function resolveTexRoot(
  startFileId: string,
  files: ProjectFile[],
  maxDepth: number = 10,
): string | null {
  const fileMap = new Map(files.map((f) => [f.relativePath, f]));
  const visited = new Set<string>();
  let currentId = startFileId;

  while (maxDepth-- > 0) {
    if (visited.has(currentId)) break; // Cycle detection
    visited.add(currentId);

    const file = files.find((f) => f.id === currentId);
    if (!file) break;

    // Try to read the content for magic comment
    // Since we don't have content here, we need a different approach
    // This will be called from compile-store which has access to content
    return file.relativePath;
  }

  return null;
}

/**
 * Parse % !TEX root magic comment from content.
 */
export function parseTexRootMagicComment(content: string): string | null {
  for (const line of content.split("\n").slice(0, 20)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("%")) continue;
    const rest = trimmed.slice(1).trim();
    if (!rest.startsWith("!TEX")) continue;
    const afterTex = rest.slice(5).trim();
    if (!afterTex.startsWith("root")) continue;
    const afterRoot = afterTex.slice(5).trim();
    if (!afterRoot.startsWith("=")) continue;
    const rootPath = afterRoot.slice(1).trim();
    if (rootPath) return rootPath;
  }
  return null;
}

/**
 * Check if content has a documentclass (is a root document).
 */
export function hasDocumentClass(content: string): boolean {
  // Simple check for \documentclass
  for (const line of content.split("\n").slice(0, 50)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("%")) continue;
    if (trimmed.includes("\\documentclass") || trimmed.includes("\\documentstyle")) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve the compile target file.
 * Returns the root file ID and relative path.
 */
export function resolveCompileTarget(
  activeFileId: string,
  files: ProjectFile[],
  getAsset: (id: string) => string,
): { rootId: string; targetPath: string } | null {
  if (files.length === 0) return null;

  const fileMap = new Map(files.map((f) => [f.id, f]));

  // Step 1: Follow % !TEX root chain from active file
  const visited = new Set<string>();
  let currentId = activeFileId;

  for (let i = 0; i < 10; i++) {
    if (visited.has(currentId)) break;
    visited.add(currentId);

    const file = fileMap.get(currentId);
    if (!file) break;

    const content = getAsset(currentId);
    const rootPath = parseTexRootMagicComment(content);

    if (!rootPath) {
      // No magic comment, check if this is a root document
      if (hasDocumentClass(content)) {
        return { rootId: currentId, targetPath: file.relativePath };
      }
      // Not a root, break and fall back
      break;
    }

    // Find the root file
    const rootFile = files.find(
      (f) =>
        f.relativePath === rootPath ||
        f.relativePath.endsWith("/" + rootPath) ||
        f.relativePath.endsWith("\\" + rootPath),
    );

    if (rootFile) {
      currentId = rootFile.id;
    } else {
      // Root file not found in project
      break;
    }
  }

  // Step 2: Fall back to finding any file with \documentclass
  for (const file of files) {
    if (file.type !== "tex" && file.type !== "style") continue;
    const content = getAsset(file.id);
    if (hasDocumentClass(content)) {
      return { rootId: file.id, targetPath: file.relativePath };
    }
  }

  // Step 3: Fall back to main.tex or document.tex
  const mainFile = files.find(
    (f) =>
      f.relativePath === "main.tex" ||
      f.relativePath.endsWith("/main.tex"),
  );
  if (mainFile) {
    return { rootId: mainFile.id, targetPath: mainFile.relativePath };
  }

  const docFile = files.find(
    (f) =>
      f.relativePath === "document.tex" ||
      f.relativePath.endsWith("/document.tex"),
  );
  if (docFile) {
    return { rootId: docFile.id, targetPath: docFile.relativePath };
  }

  // Step 4: Fall back to first tex file
  const firstTex = files.find((f) => f.type === "tex" || f.type === "style");
  if (firstTex) {
    return { rootId: firstTex.id, targetPath: firstTex.relativePath };
  }

  return null;
}
