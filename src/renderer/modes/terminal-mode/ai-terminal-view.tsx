import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useTabContext } from "@/lib/workspace/tab-context";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import { useSettingsStore } from "@/stores/settings-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useChatStore } from "@/stores/chat-store";
import { resolveAiTabMirror } from "@/lib/terminal/ai-session";
import { formatMirrorExitFooter } from "@/lib/terminal/ai-mirror";
import { resolveAiMirrorKey } from "@/lib/terminal/mirror-key";
import { resolveAiTerminalViewMode } from "@/lib/terminal/ai-terminal-lifecycle";
import { terminalSelectionRegistry } from "@/lib/terminal/selection-registry";
import { TerminalInsertHost } from "./terminal-insert-host";
import "@xterm/xterm/css/xterm.css";

interface AiTerminalViewProps {
  tabId: string;
}

function writeMirrorToTerm(term: Terminal, mirrorText: string, lastWrittenRef: { current: string }) {
  if (!mirrorText || mirrorText === lastWrittenRef.current) return;
  if (
    !lastWrittenRef.current
    || !mirrorText.startsWith(lastWrittenRef.current)
    || mirrorText.length < lastWrittenRef.current.length
  ) {
    term.clear();
    term.write(mirrorText);
  } else {
    term.write(mirrorText.slice(lastWrittenRef.current.length));
  }
  lastWrittenRef.current = mirrorText;
}

/** Read-only xterm for AI bash — live PTY stream or sessionMirrorLog replay. */
export function AiTerminalView({ tabId }: AiTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastWrittenRef = useRef("");
  const pendingChunksRef = useRef<string[]>([]);
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");
  const linkedChatTabId = useRightPanelStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.linkedChatTabId,
  );
  const mirrorKey = linkedChatTabId ? resolveAiMirrorKey(linkedChatTabId) : "";
  const sessionPhase = useTerminalAiStore((s) =>
    mirrorKey ? s.sessionStates[mirrorKey]?.phase : undefined,
  );
  const viewMode = resolveAiTerminalViewMode(agentTerminalMode, sessionPhase);
  const opencodeSessionId = useChatStore((s) =>
    linkedChatTabId ? s.tabs.find((t) => t.id === linkedChatTabId)?.sessionId : undefined,
  );

  const matchesStreamTab = useCallback(
    (payload: { sessionId: string; chatTabId: string }) =>
      payload.chatTabId === linkedChatTabId
      || (!!opencodeSessionId && payload.sessionId === opencodeSessionId),
    [linkedChatTabId, opencodeSessionId],
  );
  const sessionMirrorLog = useTerminalAiStore((s) => s.sessionMirrorLog);
  const mirrorTextMap = useTerminalAiStore((s) => s.mirrorText);
  const mirrorText = resolveAiTabMirror(tabId, sessionMirrorLog, mirrorTextMap);
  const xtermTheme = useTerminalTheme();
  const { isActive } = useTabContext();
  const [termReadySignal, setTermReadySignal] = useState(0);

  const writeLiveChunk = useCallback((chunk: string) => {
    if (!chunk) return;
    const term = termRef.current;
    if (!term) {
      pendingChunksRef.current.push(chunk);
      return;
    }
    term.write(chunk);
    lastWrittenRef.current += chunk;
  }, []);

  const flushPendingChunks = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    for (const chunk of pendingChunksRef.current) {
      term.write(chunk);
      lastWrittenRef.current += chunk;
    }
    pendingChunksRef.current = [];
  }, []);

  useEffect(() => {
    if (viewMode !== "live" || !linkedChatTabId) return;

    const unsubStream = window.electronAPI.onTerminalAiStream((payload) => {
      if (!matchesStreamTab(payload)) return;
      writeLiveChunk(payload.chunk);
    });

    const unsubExit = window.electronAPI.onTerminalAiExit((payload) => {
      if (!matchesStreamTab(payload)) return;
      writeLiveChunk(formatMirrorExitFooter(payload.exitCode, payload.exitCode !== 0));
    });

    return () => {
      unsubStream();
      unsubExit();
    };
  }, [viewMode, linkedChatTabId, matchesStreamTab, writeLiveChunk]);

  useEffect(() => {
    if (viewMode !== "replay") return;
    const term = termRef.current;
    if (!term) return;
    writeMirrorToTerm(term, mirrorText, lastWrittenRef);
  }, [mirrorText, viewMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const computedStyle = getComputedStyle(document.documentElement);
    const editorFont = computedStyle.getPropertyValue("--font-editor").trim() || "'Geist Mono', monospace";
    const editorFontSize = parseFloat(computedStyle.getPropertyValue("--font-editor-size")) || 13;

    const term = new Terminal({
      theme: xtermTheme,
      fontSize: editorFontSize,
      fontFamily: editorFont,
      cursorBlink: false,
      disableStdin: true,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    setTermReadySignal((n) => n + 1);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    terminalSelectionRegistry.register(tabId, () => term.getSelection());

    const initial = resolveAiTabMirror(
      tabId,
      useTerminalAiStore.getState().sessionMirrorLog,
      useTerminalAiStore.getState().mirrorText,
    );
    if (initial) {
      writeMirrorToTerm(term, initial, lastWrittenRef);
    }
    flushPendingChunks();

    requestAnimationFrame(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });

    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      terminalSelectionRegistry.unregister(tabId);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      lastWrittenRef.current = "";
      pendingChunksRef.current = [];
    };
  }, [tabId, xtermTheme, flushPendingChunks]);

  useEffect(() => {
    if (isActive && termRef.current) {
      requestAnimationFrame(() => termRef.current?.focus());
    }
  }, [isActive]);

  return (
    <TerminalInsertHost
      tabId={tabId}
      isAi
      termRef={termRef}
      termReadySignal={termReadySignal}
    >
      <div className="h-full w-full p-1.5" data-surface="content">
        <div ref={containerRef} className="terminal-xterm h-full w-full" />
      </div>
    </TerminalInsertHost>
  );
}
