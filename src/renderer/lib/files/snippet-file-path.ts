import { useDocumentStore } from "@/stores/document-store";
import { isExternalFileId, resolveExternalPath } from "./external-file";

export interface SnippetFilePathContext {
  files: Array<{ id: string; relativePath: string; absolutePath: string }>;
  fileMetadata: Map<string, { relativePath: string; absolutePath: string; isExternal?: boolean }>;
  projectRoot: string | null;
  checkoutRoot: string | null;
}

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

/** Strip checkout/project root prefix from an absolute path. */
export function toCheckoutRelativePath(
  path: string,
  ctx: Pick<SnippetFilePathContext, "projectRoot" | "checkoutRoot">,
): string {
  const normalized = normalizeSlashes(path.trim());
  if (!normalized) return normalized;

  const roots = [ctx.checkoutRoot, ctx.projectRoot]
    .filter((r): r is string => !!r)
    .map(normalizeSlashes);

  for (const root of roots) {
    if (normalized === root) return "";
    if (normalized.startsWith(`${root}/`)) {
      return normalized.slice(root.length + 1);
    }
  }

  return normalized;
}

/**
 * Canonical path for Add to Chat tokens and agent prompts.
 * Project files → path relative to checkout root; external files → absolute path.
 */
export function resolveSnippetFilePath(
  ctx: SnippetFilePathContext,
  fileId: string | undefined,
  fallbackPath: string,
): string {
  const fallback = fallbackPath.trim();

  if (fileId) {
    const projectFile = ctx.files.find((f) => f.id === fileId);
    if (projectFile) return projectFile.relativePath;

    const meta = ctx.fileMetadata.get(fileId);
    if (meta) {
      return meta.isExternal ? meta.absolutePath : meta.relativePath;
    }

    if (isExternalFileId(fileId)) {
      const abs = resolveExternalPath(fileId);
      if (abs) return abs;
    }

    if (!isExternalFileId(fileId)) {
      // In-project IDs are relative paths (e.g. note/note.md, manuscript/main.tex).
      if (fileId.includes("/")) return fileId;
    }
  }

  if (!fallback) return "";

  if (isExternalFileId(fallback)) {
    const abs = resolveExternalPath(fallback);
    if (abs) return abs;
  }

  const byAbsolute = ctx.files.find((f) => f.absolutePath === fallback);
  if (byAbsolute) return byAbsolute.relativePath;

  const metaByAbs = [...ctx.fileMetadata.values()].find((m) => m.absolutePath === fallback);
  if (metaByAbs) {
    return metaByAbs.isExternal ? metaByAbs.absolutePath : metaByAbs.relativePath;
  }

  const relativeFromRoot = toCheckoutRelativePath(fallback, ctx);
  const byRelative = ctx.files.find((f) => f.relativePath === relativeFromRoot);
  if (byRelative) return byRelative.relativePath;

  if (relativeFromRoot !== fallback) return relativeFromRoot;

  return fallback;
}

export function resolveSnippetFilePathFromStore(
  fileId: string | undefined,
  fallbackPath: string,
): string {
  const state = useDocumentStore.getState();
  return resolveSnippetFilePath(
    {
      files: state.files,
      fileMetadata: state.fileMetadata,
      projectRoot: state.projectRoot,
      checkoutRoot: state.checkoutRoot,
    },
    fileId,
    fallbackPath,
  );
}
