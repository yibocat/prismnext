import type { ComposerDragPayload } from "@/lib/chat/composer-drag";
import type { CodeSnippetRequest } from "@/lib/chat/context-insert";

export function codeSnippetDragPayload(
  req: Omit<CodeSnippetRequest, "kind">,
): ComposerDragPayload {
  return {
    v: 1,
    kind: "code-snippet",
    filePath: req.filePath,
    fileId: req.fileId,
    text: req.text,
    startLine: req.startLine,
    endLine: req.endLine,
    startCol: req.startCol,
    endCol: req.endCol,
    source: req.source,
    sourceTabId: req.sourceTabId,
  };
}
