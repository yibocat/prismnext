import { toast } from "sonner";
import type { Terminal } from "@xterm/xterm";
import { useComposerInsertStore } from "@/stores/composer-insert-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { terminalSelectionRegistry } from "@/lib/terminal/selection-registry";
import {
  getLastCommandBlockFromBuffer,
  getTerminalViewportText,
  type TerminalCommandBlock,
} from "@/lib/terminal/buffer";

export interface TerminalInsertContext {
  tabId: string;
  isAi?: boolean;
  /** Override selection (e.g. from xterm directly). */
  selection?: string;
  term?: Terminal | null;
  /** When true, use last block / viewport if selection is empty. */
  allowFallback?: boolean;
  /** Suppress success toast (e.g. when triggered from floating action). */
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

/** Insert terminal context into the active Chat composer. */
export function insertTerminalToChat(ctx: TerminalInsertContext): boolean {
  const payload = resolveTerminalSnippet(ctx);
  if (!payload || (!payload.output.trim() && !payload.command?.trim())) {
    toast.info("Select text in the terminal first");
    return false;
  }

  useLayoutStore.getState().setLeftSidebarView("sessions");
  useLayoutStore.getState().requestCenterExpand();
  useComposerInsertStore.getState().requestTerminalSnippet({
    command: payload.command,
    output: payload.output,
    exitCode: payload.exitCode,
    cwd: payload.cwd,
    sourceTabId: ctx.tabId,
    selection: ctx.selection,
  });

  if (!ctx.quiet) {
    toast.success("Added to Chat");
  }
  return true;
}
