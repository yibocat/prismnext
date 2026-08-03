import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import type { GitDiffHunkSnippet } from "@/lib/git/diff-hunk-snippet";

export function gitDiffDragPayload(
  snippet: GitDiffHunkSnippet & { sourceTabId?: string },
): ComposerDragPayload {
  return {
    v: 1,
    kind: "git-diff",
    filePath: snippet.filePath,
    layout: snippet.layout,
    hunks: snippet.hunks,
    removedLineCount: snippet.removedLineCount,
    addedLineCount: snippet.addedLineCount,
    sourceTabId: snippet.sourceTabId,
  };
}
