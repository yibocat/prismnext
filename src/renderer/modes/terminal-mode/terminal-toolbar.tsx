import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useExecutionStore } from "@/stores/execution-store";
import { terminalExecutionIsFinal } from "@shared/execution";
import { useSettingsStore } from "@/stores/settings-store";
import {
  PlusIcon,
  XCircleIcon,
  EraserIcon,
  Terminal as TerminalIcon,
  SparklesIcon,
  RotateCcwIcon,
  CopyIcon,
  CheckIcon,
  SquareIcon,
} from "lucide-react";
import { Hint } from "@/components/ui/hint";
import { cn, writeClipboardText } from "@/lib/utils";
import { terminalTabLabelFromCommand } from "@/lib/terminal/root";
import { shellDisplayName } from "@/lib/terminal/shell-label";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { resolveAiTerminalViewMode } from "@/lib/terminal/ai-terminal-lifecycle";
import { stripTerminalAnsi } from "@/lib/terminal/buffer";
import { resolveJobMonitorCopyText } from "./job-monitor-view";

interface TerminalToolbarProps {
  tabId: string;
  tabTitle: string;
  isAi?: boolean;
  linkedChatTabId?: string;
  linkedExecutionId?: string;
}

export function TerminalToolbar({
  tabId,
  tabTitle,
  isAi = false,
  linkedChatTabId,
  linkedExecutionId,
}: TerminalToolbarProps) {
  const { t } = useTranslation();
  const newTerminalTab = useRightPanelStore((s) => s.newTerminalTab);
  const session = useTerminalStore((s) => s.sessions[tabId]);
  const envShell = useTerminalStore((s) => s.envInfo?.shell);
  const requestRestart = useTerminalStore((s) => s.requestRestart);
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

  const [copied, setCopied] = useState(false);

  const handleCopyAiOutput = useCallback(async () => {
    const store = useExecutionStore.getState();
    const transcript = resolveJobMonitorCopyText({
      linkedChatTabId,
      linkedExecutionId,
      byId: store.byId,
      listForChat: store.listForChat,
    });
    const text = stripTerminalAnsi(transcript).trim();
    if (!text) {
      toast.info(t("modes.terminal.copyTranscriptEmpty"));
      return;
    }
    const ok = await writeClipboardText(text);
    if (!ok) {
      toast.error(t("modes.terminal.copyTranscriptFailed"));
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [linkedChatTabId, linkedExecutionId, t]);

  const handleNewTab = useCallback(() => {
    newTerminalTab();
  }, [newTerminalTab]);

  const handleCancelJob = useCallback(() => {
    const store = useExecutionStore.getState();
    const views = linkedChatTabId ? store.listForChat(linkedChatTabId) : [];
    const ids = views
      .map((view) => view.summary)
      .filter((item) => item && !terminalExecutionIsFinal(item.state))
      .map((item) => item!.executionId);
    for (const id of ids.length > 0 ? ids : (linkedExecutionId ? [linkedExecutionId] : [])) {
      void window.electronAPI.executionCancel(id);
    }
  }, [linkedChatTabId, linkedExecutionId]);

  const handleOpenShell = useCallback(() => {
    const cwd = linkedExecutionId
      ? useExecutionStore.getState().byId[linkedExecutionId]?.summary?.cwd
      : undefined;
    if (!cwd) return;
    useRightPanelStore.getState().openTerminalAtCwd(cwd, cwd.split("/").pop());
  }, [linkedExecutionId]);

  const displayLabel = isAi
    ? tabTitle
    : session?.lastCommand
      ? terminalTabLabelFromCommand(session.lastCommand, 48, shellLabel)
      : tabTitle || shellLabel;

  const executionState = useExecutionStore((s) =>
    linkedExecutionId ? s.byId[linkedExecutionId]?.summary?.state : undefined,
  );
  const executionCwd = useExecutionStore((s) =>
    linkedExecutionId ? s.byId[linkedExecutionId]?.summary?.cwd : undefined,
  );
  const aiViewMode = resolveAiTerminalViewMode(agentTerminalMode, sessionState?.phase);
  const jobLive = executionState ? !terminalExecutionIsFinal(executionState) : aiViewMode === "live";
  const aiModeBadge = jobLive ? "live" : "replay";

  if (isAi) {
    return (
      <>
        <SparklesIcon className="size-3.5 shrink-0 text-primary" />
        <span
          className="text-[length:var(--font-size-12)] truncate max-w-[200px] text-muted-foreground"
          title={tabTitle}
        >
          {displayLabel}
        </span>
        <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-px text-[length:var(--font-hint)] text-muted-foreground">
          {t("modes.terminal.readOnlyLive", {
            mode: t(aiModeBadge === "live" ? "modes.terminal.live" : "modes.terminal.replay"),
          })}
        </span>
        <div className="flex-1" />
        <Hint label={t("modes.terminal.cancelJob")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
            onClick={handleCancelJob}
            disabled={!jobLive}
          >
            <SquareIcon className="size-3.5" />
          </button>
        </Hint>
        <Hint label={t("modes.terminal.openShellAtCwd")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
            onClick={handleOpenShell}
            disabled={!executionCwd}
          >
            <TerminalIcon className="size-3.5" />
          </button>
        </Hint>
        <Hint label={copied ? t("common.copied") : t("modes.terminal.copyTranscript")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={() => void handleCopyAiOutput()}
          >
            {copied ? <CheckIcon className="size-3.5 text-success" /> : <CopyIcon className="size-3.5" />}
          </button>
        </Hint>
        <Hint label={t("modes.terminal.newTab")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={handleNewTab}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </Hint>
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
        <Hint label={t("modes.terminal.copyCwd")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={handleCopyCwd}
          >
            <CopyIcon className="size-3.5" />
          </button>
        </Hint>
      ) : null}

      <Hint label={t("modes.terminal.clearScreen")}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
          onClick={handleClear}
          disabled={!isActive}
        >
          <EraserIcon className="size-3.5" />
        </button>
      </Hint>

      {canRestart ? (
        <Hint label={t("modes.terminal.restart")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            onClick={handleRestart}
          >
            <RotateCcwIcon className="size-3.5" />
          </button>
        </Hint>
      ) : (
        <Hint label={t("modes.terminal.interrupt")}>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0 disabled:opacity-40"
            onClick={handleKill}
            disabled={!isActive}
          >
            <XCircleIcon className="size-3.5" />
          </button>
        </Hint>
      )}

      <Hint label={t("modes.terminal.newShellTab", { shell: shellLabel })}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={handleNewTab}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </Hint>
    </>
  );
}
