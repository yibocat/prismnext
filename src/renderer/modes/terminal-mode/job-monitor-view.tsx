import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SelectionInsertAction } from "@/components/modules/shared/selection-insert-action";
import { insertTerminalToChat } from "@/lib/chat/insert-to-chat";
import {
  chipPositionFromDomSelection,
  type ResolvedChipPosition,
} from "@/lib/selection-chip-position";
import { matchesShortcutEvent, shortcutChordLabel } from "@/lib/shortcuts";
import { useExecutionStore, type ExecutionViewState } from "@/stores/execution-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

interface JobMonitorViewProps {
  tabId: string;
  executionId: string;
}

export function formatJobMonitorTranscript(views: ExecutionViewState[]): string {
  return views
    .map((view) => {
      const command = view.summary?.command?.trim() || "";
      const body = (view.tail ?? "").replace(/\n+$/, "");
      const header = command ? `$ ${command}` : "";
      return [header, body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Same text the monitor shows — used by the tab toolbar Copy button. */
export function resolveJobMonitorCopyText(args: {
  linkedChatTabId?: string;
  linkedExecutionId?: string;
  byId: Record<string, ExecutionViewState>;
  listForChat: (chatTabId: string) => ExecutionViewState[];
}): string {
  const views = args.linkedChatTabId ? args.listForChat(args.linkedChatTabId) : [];
  if (views.length > 0) {
    const formatted = formatJobMonitorTranscript(views);
    if (formatted.trim()) return formatted;
  }
  const one = args.linkedExecutionId ? args.byId[args.linkedExecutionId] : undefined;
  if (!one) return "";
  const formatted = formatJobMonitorTranscript([one]);
  return formatted.trim() ? formatted : (one.tail ?? "");
}

function JobMonitorInsertHost({
  tabId,
  children,
}: {
  tabId: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [chipPos, setChipPos] = useState<ResolvedChipPosition | null>(null);
  const [selection, setSelection] = useState("");

  const dismissAction = useCallback(() => {
    setChipPos(null);
    setSelection("");
  }, []);

  const updateActionPosition = useCallback(() => {
    const container = containerRef.current;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!container || !sel || !text || sel.rangeCount === 0) {
      dismissAction();
      return;
    }
    const node = sel.anchorNode;
    if (!node || !container.contains(node)) {
      dismissAction();
      return;
    }
    const pos = chipPositionFromDomSelection();
    if (!pos) {
      dismissAction();
      return;
    }
    setSelection(text);
    setChipPos(pos);
  }, [dismissAction]);

  const runInsert = useCallback(() => {
    if (!selection) return false;
    const ok = insertTerminalToChat({
      tabId,
      isAi: true,
      selection,
      quiet: true,
    });
    if (ok) {
      window.getSelection()?.removeAllRanges();
      dismissAction();
    }
    return ok;
  }, [dismissAction, selection, tabId]);

  useEffect(() => {
    const onSelectionChange = () => {
      requestAnimationFrame(updateActionPosition);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("resize", updateActionPosition);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("resize", updateActionPosition);
    };
  }, [updateActionPosition]);

  useEffect(() => {
    if (!selection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcutEvent("workspace.insertToChat", e)) return;
      e.preventDefault();
      e.stopPropagation();
      runInsert();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [runInsert, selection]);

  return (
    <div ref={containerRef} className="relative flex h-full min-h-0 flex-col">
      {children}
      <SelectionInsertAction
        open={!!chipPos && !!selection}
        x={chipPos?.left ?? 0}
        y={chipPos?.top ?? 0}
        chipPlacement={chipPos?.placement}
        anchor="viewport"
        shortcut={shortcutChordLabel("workspace.insertToChat")}
        label={t("common.addToChat")}
        onInsert={runInsert}
        onDismiss={dismissAction}
      />
    </div>
  );
}

export function JobMonitorView({ tabId, executionId }: JobMonitorViewProps) {
  const { t } = useTranslation();
  const chatTabId = useRightPanelStore(
    (s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      return tab?.kind === "terminal" ? tab.linkedChatTabId : undefined;
    },
  );
  const byId = useExecutionStore((s) => s.byId);
  const sessionViews = useMemo(() => {
    if (chatTabId) {
      const listed = useExecutionStore.getState().listForChat(chatTabId);
      if (listed.length > 0) return listed;
    }
    const one = byId[executionId];
    return one ? [one] : [];
  }, [byId, chatTabId, executionId]);
  const latest = sessionViews[sessionViews.length - 1] ?? byId[executionId];
  const attach = useExecutionStore((s) => s.attach);
  const sessionKey = sessionViews
    .map((view) => view.summary?.executionId)
    .filter(Boolean)
    .join(",");
  const attachedRef = useRef(new Set<string>());

  useEffect(() => {
    const ids = sessionKey ? sessionKey.split(",") : [executionId];
    for (const id of ids) {
      if (!id || attachedRef.current.has(id)) continue;
      attachedRef.current.add(id);
      void attach(id);
    }
  }, [attach, executionId, sessionKey]);

  const transcript = sessionViews.length > 1 || chatTabId
    ? formatJobMonitorTranscript(sessionViews)
    : (latest?.tail ?? "");
  const unavailable = Boolean(latest?.error) && !transcript.trim();

  return (
    <JobMonitorInsertHost tabId={tabId}>
      <div className="flex h-full min-h-0 flex-col bg-background">
        {unavailable ? (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            {t("modes.terminal.jobUnavailable")}
          </div>
        ) : (
          <pre
            data-testid="job-monitor-transcript"
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[length:var(--font-code)] text-foreground"
          >
            {transcript}
          </pre>
        )}
      </div>
    </JobMonitorInsertHost>
  );
}

