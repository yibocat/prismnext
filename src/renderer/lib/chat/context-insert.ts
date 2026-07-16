import { createTokenId, type ComposerPart } from "@/lib/chat/composer-parts";
import type { ExtractBlockType } from "../../../shared/paper-extract-block";
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

export interface PaperSnippetRequest {
  kind: "paper";
  bibkey: string;
  title: string;
  page: number;
  quotedText: string;
  /** Library paper id — used to auto-enable intensive reading for MinerU excerpts. */
  paperId?: string;
  annotationId?: string;
  sourceTabId?: string;
  blockId?: string;
  blockType?: ExtractBlockType;
  extractSource?: "mineru";
}

/**
 * An experiment run + the artifact being inspected, pushed to chat so the agent
 * can discuss "how this figure was produced" with full command/env context.
 */
export interface ExperimentRunSnippetRequest {
  kind: "experiment-run";
  runId: string;
  experimentId?: string;
  command: string;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  /** The artifact path being discussed (project-relative or lab-relative), if any. */
  artifactPath?: string;
  /** How the artifact was linked to the run (trust signal). */
  linkMethod?: string;
  artifacts?: string[];
  env?: { python?: string | null; pythonVersion?: string | null; platform?: string; gitCommit?: string | null };
  chatSessionId?: string | null;
  workspacePath?: string;
  sourceTabId?: string;
  /** Optional ExperimentRunKind (train/eval/…). Named `runKind` to avoid clashing with request `kind`. */
  runKind?: string;
  notes?: string;
  logPath?: string | null;
  /**
   * `cite-in-paper` — Methods / figure scaffolding for the agent (Use in paper).
   * `discuss` (default) — open-ended chat about the run.
   */
  intent?: "discuss" | "cite-in-paper";
}

export type ContextInsertRequest =
  | TerminalSnippetRequest
  | CodeSnippetRequest
  | GitDiffSnippetRequest
  | PaperSnippetRequest
  | ExperimentRunSnippetRequest;

export function codeSnippetLabel(req: Pick<CodeSnippetRequest, "filePath" | "startLine" | "endLine">): string {
  const shortPath = req.filePath.split("/").pop() || req.filePath;
  if (req.startLine === req.endLine) return `${shortPath}:${req.startLine}`;
  return `${shortPath}:${req.startLine}-${req.endLine}`;
}

export function paperSnippetLabel(req: Pick<PaperSnippetRequest, "bibkey" | "page">): string {
  return `${req.bibkey}:p${req.page}`;
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

  if (req.kind === "paper") {
    return {
      type: "paper-snippet",
      id: createTokenId(),
      label: paperSnippetLabel(req),
      bibkey: req.bibkey,
      title: req.title,
      page: req.page,
      quotedText: req.quotedText,
      annotationId: req.annotationId,
      sourceTabId: req.sourceTabId,
      blockId: req.blockId,
      blockType: req.blockType,
      extractSource: req.extractSource,
    };
  }

  if (req.kind === "experiment-run") {
    const shortId = req.runId.split("-").slice(0, 3).join("-");
    const intent = req.intent === "cite-in-paper" ? "cite-in-paper" : "discuss";
    return {
      type: "experiment-run",
      id: createTokenId(),
      label: intent === "cite-in-paper" ? `cite:${shortId}` : `run:${shortId}`,
      runId: req.runId,
      experimentId: req.experimentId,
      command: req.command,
      exitCode: req.exitCode,
      startedAt: req.startedAt,
      finishedAt: req.finishedAt,
      artifactPath: req.artifactPath,
      linkMethod: req.linkMethod,
      artifacts: req.artifacts ?? [],
      env: req.env ?? null,
      chatSessionId: req.chatSessionId ?? null,
      workspacePath: req.workspacePath,
      sourceTabId: req.sourceTabId,
      kind: req.runKind,
      notes: req.notes,
      logPath: req.logPath ?? null,
      intent,
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
