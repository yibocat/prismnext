import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  PlusIcon,
  XCircleIcon,
  EraserIcon,
  Terminal as TerminalIcon,
  SparklesIcon,
  RotateCcwIcon,
  CopyIcon,
  PinIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { terminalTabLabelFromCommand } from "@/lib/terminal/root";
import { shellDisplayName } from "@/lib/terminal/shell-label";
import { resolveAiTabMirror } from "@/lib/terminal/ai-session";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { resolveAiTerminalViewMode } from "@/lib/terminal/ai-terminal-lifecycle";
import { stripTerminalAnsi } from "@/lib/terminal/buffer";

interface TerminalToolbarProps {
  tabId: string;
  tabTitle: string;
  isAi?: boolean;
  linkedChatTabId?: string;
}

export function TerminalToolbar({
  tabId,
  tabTitle,
  isAi = false,
  linkedChatTabId,
}: TerminalToolbarProps) {
  const { t } = useTranslation();
  const newTerminalTab = useRightPanelStore((s) => s.newTerminalTab);
  const session = useTerminalStore((s) => s.sessions[tabId]);
  const envShell = useTerminalStore((s) => s.envInfo?.shell);
  const sessionMirrorLog = useTerminalAiStore((s) => s.sessionMirrorLog);
  const mirrorTextMap = useTerminalAiStore((s) => s.mirrorText);
  const requestRestart = useTerminalStore((s) => s.requestRestart);
  const togglePin = useTerminalAiStore((s) => s.toggleAiTerminalPinned);
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");

  const mirrorKey = linkedChatTabId ? resolveAiMirrorKey(linkedChatTabId) : "";
  const sessionState = useTerminalAiStore((s) =>
    mirrorKey ? s.sessionStates[mirrorKey] : undefined,
  );
  const sessionId = session?.sessionId;
  const status = session?.status;
  const isActive = status === "running" || status === "starting";
  const canRestart = status === "exited" || status === "error" || status === "killed";
  const shellLabel = shellDisplayName(session?.shell || envShell);

  const handleKill = useCallback(() => {
    if (!sessionId || !isActive) return;
    window.electronAPI.terminalWrite({ sessionId, data: "\x03" });
  }, [sessionId, isActive]);

  const handleClear = useCallback(() => {
    if (!sessionId || !isActive) return;
    const cmd = window.electronAPI.platform === "win32" ? "cls\r" : "clear\r";
    window.electronAPI.terminalWrite({ sessionId, data: cmd });
  }, [sessionId, isActive]);

  const handleRestart = useCallback(() => {
    requestRestart(tabId);
  }, [requestRestart, tabId]);

  const handleCopyCwd = useCallback(async () => {
    if (!session?.cwd) return;
    try {
      await navigator.clipboard.writeText(session.cwd);
    } catch {
      // ignore clipboard failures
    }
  }, [session?.cwd]);

  const handleCopyAiOutput = useCallback(async () => {
    const mirror = resolveAiTabMirror(tabId, sessionMirrorLog, mirrorTextMap);
    if (!mirror.trim()) return;
    try {
      await navigator.clipboard.writeText(stripTerminalAnsi(mirror));
    } catch {
      // ignore
    }
  }, [tabId, sessionMirrorLog, mirrorTextMap]);

  const handleNewTab = useCallback(() => {
    newTerminalTab();
  }, [newTerminalTab]);

  const handleTogglePin = useCallback(() => {
    if (!linkedChatTabId) return;
    togglePin(linkedChatTabId);
  }, [linkedChatTabId, togglePin]);

  const displayLabel = isAi
    ? tabTitle
    : session?.lastCommand
      ? terminalTabLabelFromCommand(session.lastCommand, 48, shellLabel)
      : tabTitle || shellLabel;

  const aiViewMode = resolveAiTerminalViewMode(agentTerminalMode, sessionState?.phase);
  const aiModeBadge = aiViewMode === "live" ? "live" : "replay";

  if (isAi) {
    return (
      <>
        <SparklesIcon className="size-3.5 shrink-0 text-primary/80" />
        <span
          className="text-[length:var(--font-size-12)] truncate max-w-[200px] text-muted-foreground"
          title={tabTitle}
        >
          {displayLabel}
        </span>
        <span className="shrink-0 rounded border border-border/60 bg-muted/30 px-1.5 py-px text-[length:var(--font-hint)] text-muted-foreground">
          read-only · {aiModeBadge}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded transition-colors shrink-0",
            sessionState?.pinned
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
          title={sessionState?.pinned ? "Unpin tab (allow idle cleanup)" : "Pin tab (skip idle cleanup)"}
          onClick={handleTogglePin}
          disabled={!linkedChatTabId}
        >
          <PinIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title="Copy output"
          onClick={() => void handleCopyAiOutput()}
        >
          <CopyIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title={t("modes.terminal.newTab")}
          onClick={handleNewTab}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </>
    );
  }

  return (
    <>
      <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />

      <span
        className={cn(
          "text-[length:var(--font-size-12)] truncate max-w-[200px]",
          status === "exited" || status === "error" ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
        title={session?.lastCommand || session?.cwd || tabTitle}
      >
        {displayLabel}
      </span>

      <div className="flex-1" />

      {session?.cwd ? (
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title="Copy working directory"
          onClick={handleCopyCwd}
        >
          <CopyIcon className="size-3.5" />
        </button>
      ) : null}

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
        title={t("modes.terminal.clearScreen")}
        onClick={handleClear}
        disabled={!isActive}
      >
        <EraserIcon className="size-3.5" />
      </button>

      {canRestart ? (
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          title={t("modes.terminal.restart")}
          onClick={handleRestart}
        >
          <RotateCcwIcon className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
          title={t("modes.terminal.interrupt")}
          onClick={handleKill}
          disabled={!isActive}
        >
          <XCircleIcon className="size-3.5" />
        </button>
      )}

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title={`New ${shellLabel} tab`}
        onClick={handleNewTab}
      >
        <PlusIcon className="size-3.5" />
      </button>
    </>
  );
}
