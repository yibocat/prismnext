import { toast } from "sonner";
import type { Terminal } from "@xterm/xterm";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useChatStore } from "@/stores/chat-store";
import { terminalSelectionRegistry } from "@/lib/terminal/selection-registry";
import {
  getLastCommandBlockFromBuffer,
  getTerminalViewportText,
  type TerminalCommandBlock,
} from "@/lib/terminal/buffer";
import type {
  CodeSnippetRequest,
  ContextInsertRequest,
  PaperSnippetRequest,
} from "@/lib/chat/context-insert";
import type { GitDiffHunkSnippet } from "@/lib/git/diff-hunk-snippet";
import { resolveSnippetFilePathFromStore } from "@/lib/files/snippet-file-path";
import { offsetToLineCol } from "@/lib/editor/selection-anchor";
import { useComposerEditorStore } from "@/stores/composer-editor-store";

export interface TerminalInsertContext {
  tabId: string;
  isAi?: boolean;
  selection?: string;
  term?: Terminal | null;
  allowFallback?: boolean;
  quiet?: boolean;
}

export interface CodeInsertContext {
  filePath: string;
  fileId?: string;
  text: string;
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
  source: CodeSnippetRequest["source"];
  sourceTabId?: string;
  quiet?: boolean;
}

function resolveTerminalSnippet(
  ctx: TerminalInsertContext,
): TerminalCommandBlock & { exitCode?: number; cwd?: string } | null {
  const selection = (ctx.selection ?? terminalSelectionRegistry.getSelection(ctx.tabId)).trim();
  const session = useTerminalStore.getState().sessions[ctx.tabId];
  const aiBash = useTerminalAiStore.getState().bashByTab[ctx.tabId];

  if (selection) {
    return {
      command: ctx.isAi ? aiBash?.command : session?.lastCommand,
      output: selection,
      exitCode: ctx.isAi ? aiBash?.exitCode : undefined,
      cwd: ctx.isAi ? aiBash?.cwd : session?.cwd,
    };
  }

  if (ctx.isAi && aiBash) {
    if (aiBash.output?.trim() || aiBash.command?.trim()) {
      return {
        command: aiBash.command,
        output: aiBash.output,
        exitCode: aiBash.exitCode,
        cwd: aiBash.cwd,
      };
    }
  }

  if (!ctx.allowFallback) return null;

  const recorded = session?.lastCommandBlock;
  if (recorded?.output.trim() || recorded?.command?.trim()) {
    return {
      command: recorded.command ?? session?.lastCommand,
      output: recorded.output,
      cwd: session?.cwd,
    };
  }

  if (ctx.term) {
    const block = getLastCommandBlockFromBuffer(ctx.term, session?.lastCommand);
    if (block.output.trim() || block.command?.trim()) {
      return { ...block, cwd: session?.cwd };
    }
    const viewport = getTerminalViewportText(ctx.term);
    if (viewport.trim()) {
      return { command: session?.lastCommand, output: viewport, cwd: session?.cwd };
    }
  }

  if (session?.lastCommand?.trim()) {
    return { command: session.lastCommand, output: "", cwd: session.cwd };
  }

  return null;
}

/** Navigate to Chat and enqueue a context insert for the composer. */
export function insertContextToChat(req: ContextInsertRequest, options?: { quiet?: boolean }): boolean {
  const layout = useLayoutStore.getState();

  if (layout.editorMaximized) {
    useComposerInsertStore.getState().requestInsert(req);
    layout.requestAiBarComposerFocus();
    useComposerEditorStore.getState().flushPendingInsert();
  } else {
    layout.setLeftSidebarView("sessions");
    layout.requestCenterExpand();
    useComposerInsertStore.getState().requestInsert(req);
    useComposerEditorStore.getState().flushPendingInsert();
  }

  if (!options?.quiet) {
    toast.success("Added to Chat");
  }
  return true;
}

/** Insert git diff hunk snippet into the active Chat composer. */
export function insertGitDiffToChat(
  snippet: GitDiffHunkSnippet & { sourceTabId?: string; quiet?: boolean },
): boolean {
  const { quiet, sourceTabId, ...payload } = snippet;
  return insertContextToChat(
    {
      kind: "git-diff",
      ...payload,
      sourceTabId,
    },
    { quiet },
  );
}

/** Insert editor selection into the active Chat composer. */
export function insertCodeToChat(ctx: CodeInsertContext): boolean {
  if (!ctx.text.trim()) {
    toast.info("Select text in the editor first");
    return false;
  }

  const filePath = resolveSnippetFilePathFromStore(ctx.fileId, ctx.filePath);

  return insertContextToChat(
    {
      kind: "code",
      filePath,
      fileId: ctx.fileId,
      text: ctx.text,
      startLine: ctx.startLine,
      endLine: ctx.endLine,
      startCol: ctx.startCol,
      endCol: ctx.endCol,
      source: ctx.source,
      sourceTabId: ctx.sourceTabId,
    },
    { quiet: ctx.quiet },
  );
}

/** Build line range from full document text and selection offsets. */
export function lineRangeFromSelection(
  doc: string,
  from: number,
  to: number,
): Pick<CodeInsertContext, "text" | "startLine" | "endLine" | "startCol" | "endCol"> {
  const text = doc.slice(from, to);
  const start = offsetToLineCol(doc, from);
  const end = offsetToLineCol(doc, to);
  return {
    text,
    startLine: start.line,
    endLine: end.line,
    startCol: start.col,
    endCol: end.col,
  };
}

/** MinerU PDF block excerpts imply intensive reading for the source paper. */
function ensureIntensiveReadingForPaper(paperId: string): boolean {
  const chat = useChatStore.getState();
  const tab = chat.tabs.find((t) => t.id === chat.activeTabId);
  if (!tab || tab.intensivePaperIds.includes(paperId)) return false;
  chat.addIntensivePaper(tab.id, paperId);
  return true;
}

/** Insert literature PDF excerpt into the active Chat composer. */
export function insertPaperToChat(
  req: Omit<PaperSnippetRequest, "kind"> & { quiet?: boolean },
): boolean {
  const { quiet, ...payload } = req;
  if (!payload.quotedText.trim()) {
    toast.info("Highlight text in the PDF first");
    return false;
  }

  const newlyIntensive =
    payload.extractSource === "mineru" && payload.paperId
      ? ensureIntensiveReadingForPaper(payload.paperId)
      : false;

  const ok = insertContextToChat(
    {
      kind: "paper",
      ...payload,
    },
    { quiet: true },
  );

  if (ok && !quiet) {
    toast.success(
      newlyIntensive
        ? "Added to Chat — intensive reading enabled for this paper"
        : "Added to Chat",
    );
  }
  return ok;
}

/** Insert terminal context into the active Chat composer. */
export function insertTerminalToChat(ctx: TerminalInsertContext): boolean {
  const payload = resolveTerminalSnippet(ctx);
  if (!payload || (!payload.output.trim() && !payload.command?.trim())) {
    toast.info("Select text in the terminal first");
    return false;
  }

  return insertContextToChat(
    {
      kind: "terminal",
      command: payload.command,
      output: payload.output,
      exitCode: payload.exitCode,
      cwd: payload.cwd,
      sourceTabId: ctx.tabId,
      selection: ctx.selection,
    },
    { quiet: ctx.quiet },
  );
}
