import { createTokenId, type ComposerPart } from "@/lib/chat/composer-parts";
import {
  gitDiffSnippetLabel,
  gitDiffSnippetTooltip,
  type GitDiffHunk,
} from "@/lib/git/diff-hunk-snippet";
import { resolveSnippetFilePathFromStore } from "@/lib/files/snippet-file-path";
import { terminalTabLabelFromCommand } from "@/lib/terminal/root";
import { truncateTerminalOutput } from "@/lib/terminal/ai-mirror";

export interface TerminalSnippetRequest {
  kind: "terminal";
  command?: string;
  output: string;
  exitCode?: number;
  cwd?: string;
  sourceTabId?: string;
  selection?: string;
}

export interface CodeSnippetRequest {
  kind: "code";
  filePath: string;
  fileId?: string;
  text: string;
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
  source: "editor" | "git-diff";
  sourceTabId?: string;
}

export interface GitDiffSnippetRequest {
  kind: "git-diff";
  filePath: string;
  layout: "unified" | "split";
  hunks: GitDiffHunk[];
  removedLineCount: number;
  addedLineCount: number;
  sourceTabId?: string;
}

export type ContextInsertRequest =
  | TerminalSnippetRequest
  | CodeSnippetRequest
  | GitDiffSnippetRequest;

export function codeSnippetLabel(req: Pick<CodeSnippetRequest, "filePath" | "startLine" | "endLine">): string {
  const shortPath = req.filePath.split("/").pop() || req.filePath;
  if (req.startLine === req.endLine) return `${shortPath}:${req.startLine}`;
  return `${shortPath}:${req.startLine}-${req.endLine}`;
}

export function contextInsertToPart(req: ContextInsertRequest): ComposerPart {
  if (req.kind === "terminal") {
    const command = req.command?.trim();
    const output = truncateTerminalOutput(req.output || req.selection || "");
    const label = command
      ? `$ ${terminalTabLabelFromCommand(command, 32)}`
      : "Terminal output";
    return {
      type: "terminal-snippet",
      id: createTokenId(),
      label,
      command,
      output,
      exitCode: req.exitCode,
      cwd: req.cwd,
      sourceTabId: req.sourceTabId,
    };
  }

  if (req.kind === "git-diff") {
    const filePath = resolveSnippetFilePathFromStore(undefined, req.filePath);
    const label = gitDiffSnippetLabel(filePath, req.hunks);
    const title = gitDiffSnippetTooltip(req.removedLineCount, req.addedLineCount);
    return {
      type: "git-diff-snippet",
      id: createTokenId(),
      label,
      title,
      filePath,
      layout: req.layout,
      hunks: req.hunks,
      removedLineCount: req.removedLineCount,
      addedLineCount: req.addedLineCount,
      sourceTabId: req.sourceTabId,
    };
  }

  const filePath = resolveSnippetFilePathFromStore(req.fileId, req.filePath);

  return {
    type: "code-snippet",
    id: createTokenId(),
    label: codeSnippetLabel({ ...req, filePath }),
    filePath,
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

/** @deprecated Use TerminalSnippetRequest with kind: "terminal" */
export type LegacyTerminalSnippetRequest = Omit<TerminalSnippetRequest, "kind">;

export function legacyTerminalRequest(
  req: LegacyTerminalSnippetRequest,
): TerminalSnippetRequest {
  return { kind: "terminal", ...req };
}
