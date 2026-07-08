import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useDocumentStore } from "@/stores/document-store";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import { useTerminalStore } from "@/stores/terminal-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabContext } from "@/lib/workspace/tab-context";
import {
  resolveTerminalRoot,
} from "@/lib/terminal/root";
import { applyOsc133BusySequence, parseOsc133Events } from "@/lib/terminal/osc";
import { applyTerminalInput, type TerminalInputLineState } from "@/lib/terminal/input-line";
import { appendTerminalCapture, stripTerminalAnsi } from "@/lib/terminal/buffer";
import { terminalSelectionRegistry } from "@/lib/terminal/selection-registry";
import { useTerminalSelectionStore } from "@/stores/terminal-selection-store";
import { TerminalPlaceholder } from "./terminal-placeholder";
import { TerminalInsertHost } from "./terminal-insert-host";
import "@xterm/xterm/css/xterm.css";

// ─── Generation counter: ensures each mount gets a unique session ID ───

let _globalGen = 0;

// ─── Props ───

interface TerminalViewProps {
  tabId: string;
}

// ─── Component ───

export function TerminalView({ tabId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);
  const terminalRoot = resolveTerminalRoot(checkoutRoot, projectRoot);
  // Sprint 0.7 "Open terminal in lab": a tab carrying `terminalCwd` spawns
  // the PTY there instead of the project-wide terminalRoot. Plain user/AI
  // terminals leave it undefined and fall back to terminalRoot (unchanged).
  const terminalCwd = useRightPanelStore((s) => s.tabs.find((t) => t.id === tabId)?.terminalCwd);
  const spawnCwd = terminalCwd ?? terminalRoot;
  const xtermTheme = useTerminalTheme();
  const setSessionCommand = useTerminalStore((s) => s.setSessionCommand);
  const restartNonce = useTerminalStore((s) => s.restartNonce[tabId] ?? 0);
  const sessionStatus = useTerminalStore((s) => s.sessions[tabId]?.status);
  const { isActive } = useTabContext();
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [termReadySignal, setTermReadySignal] = useState(0);

  // ─── Initialize terminal ───

  useEffect(() => {
    if (!spawnCwd || !projectRoot || !containerRef.current) return;

    const gen = ++_globalGen;
    const sessionId = `${tabId}:${gen}:${restartNonce}`;

    const container = containerRef.current;
    setSpawnError(null);
    useTerminalStore.getState().markSessionStarting(tabId, sessionId);

    const computedStyle = getComputedStyle(document.documentElement);
    const editorFont = computedStyle.getPropertyValue("--font-editor").trim() || "'Geist Mono', 'Menlo', 'Monaco', 'Courier New', monospace";
    const editorFontSize = parseFloat(computedStyle.getPropertyValue("--font-editor-size")) || 13;

    const term = new Terminal({
      theme: xtermTheme,
      fontSize: editorFontSize,
      fontFamily: editorFont,
      cursorBlink: true,
      cursorStyle: "bar",
      drawBoldTextInBrightColors: true,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    setTermReadySignal((n) => n + 1);

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    terminalSelectionRegistry.register(tabId, () => term.getSelection());

    let activeSessionId = sessionId;
    let disposed = false;
    let inputLine: TerminalInputLineState = { line: "" };
    let captureBuf = "";
    let capturing = false;

    // ─── Spawn PTY ───
    window.electronAPI
      .terminalCreate({
        sessionId,
        tabId,
        projectRoot,
        cwd: spawnCwd,
      })
      .then(({ shell, cwd, pid }) => {
        if (disposed) return;
        useTerminalStore.getState().registerSession(tabId, sessionId, { shell, cwd, pid });
      })
      .catch((err) => {
        if (disposed) return;
        const message = err instanceof Error ? err.message : String(err);
        setSpawnError(message);
        useTerminalStore.getState().markSessionExited(tabId, 1);
        term.writeln(`\x1b[1;31mPTY failed: ${message}\x1b[0m`);
      });

    // ─── Input → PTY ───
    const onDataDisposable = term.onData((data) => {
      const current = useTerminalStore.getState().sessions[tabId];
      if (current?.status === "exited" || current?.status === "killed" || current?.status === "error") {
        return;
      }

      const submitted = data.includes("\r") || data.includes("\n");
      if (submitted) {
        useTerminalStore.getState().markCommandSubmitted(tabId);
      }

      const inputResult = applyTerminalInput(data, inputLine);
      inputLine = inputResult.state;
      if (inputResult.submitted) {
        setSessionCommand(tabId, inputResult.submitted);
      }

      if (data.includes("\x03")) {
        // Ctrl+C — stay busy until shell integration reports command end.
        useTerminalStore.getState().markCommandSubmitted(tabId);
      }

      window.electronAPI.terminalWrite({ sessionId: activeSessionId, data });
    });

    // ─── PTY output → display ───
    const unsubData = window.electronAPI.onTerminalData(({ sessionId: sid, data }) => {
      if (sid !== activeSessionId) return;

      term.write(data);

      const events = parseOsc133Events(data);
      if (events.includes("commandStart")) {
        capturing = true;
        captureBuf = "";
      }
      if (capturing) {
        captureBuf = appendTerminalCapture(captureBuf, data);
      }
      if (events.includes("commandEnd") || events.includes("promptStart")) {
        if (capturing) {
          const cmd = useTerminalStore.getState().sessions[tabId]?.lastCommand;
          const output = stripTerminalAnsi(captureBuf).trim();
          if (output || cmd) {
            useTerminalStore.getState().setLastCommandBlock(tabId, {
              command: cmd,
              output,
              capturedAt: Date.now(),
            });
          }
        }
        capturing = false;
      }

      if (events.length === 0) return;

      const session = useTerminalStore.getState().sessions[tabId];
      if (!session) return;

      const nextBusy = applyOsc133BusySequence(events, session.busy);
      if (nextBusy !== session.busy) {
        useTerminalStore.getState().setBusy(tabId, nextBusy);
      }

      if (events.includes("promptStart")) {
        inputLine = { line: "" };
      }
    });

    // ─── PTY exit ───
    const unsubExit = window.electronAPI.onTerminalExit(({ sessionId: sid, exitCode }) => {
      if (sid !== activeSessionId) return;
      useTerminalStore.getState().markSessionExited(tabId, exitCode);
      term.write(`\r\n\x1b[1;33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      term.writeln(`\x1b[2mUse Restart in the toolbar, or close this tab\x1b[0m`);
    });

    // ─── Fit + focus ───
    const fitAndFocus = () => {
      try { fitAddon.fit(); } catch { /* ignore */ }
      term.focus();
    };
    requestAnimationFrame(fitAndFocus);

    // ─── Resize ───
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(container);

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.electronAPI.terminalResize({ sessionId: activeSessionId, cols, rows });
    });

    // ─── Cleanup ───
    return () => {
      disposed = true;
      terminalSelectionRegistry.unregister(tabId);
      useTerminalSelectionStore.getState().unregister(tabId);
      unsubData();
      unsubExit();
      onDataDisposable.dispose();
      resizeObserver.disconnect();
      resizeDisposable.dispose();
      window.electronAPI.terminalDestroy({ sessionId: activeSessionId });
      const current = useTerminalStore.getState().sessions[tabId];
      if (current?.sessionId === activeSessionId) {
        useTerminalStore.getState().removeSession(tabId);
      }
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [projectRoot, terminalRoot, spawnCwd, tabId, restartNonce, setSessionCommand]);

  // ─── Focus when tab becomes active ───

  useEffect(() => {
    if (isActive && termRef.current) {
      requestAnimationFrame(() => termRef.current?.focus());
    }
  }, [isActive]);

  // ─── Theme ───

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = xtermTheme;
    }
  }, [xtermTheme]);

  // ─── Click handler ───

  const handleMouseDown = useCallback(() => {
    setTimeout(() => termRef.current?.focus(), 0);
  }, []);

  // ─── Render ───

  if (!projectRoot) {
    return <TerminalPlaceholder reason="no-project" />;
  }

  if (!terminalRoot) {
    return <TerminalPlaceholder reason="no-root" />;
  }

  return (
    <TerminalInsertHost tabId={tabId} termRef={termRef} termReadySignal={termReadySignal}>
      <div
        className="h-full w-full p-1.5"
        data-surface="content"
        onMouseDown={handleMouseDown}
      >
        {spawnError && sessionStatus === "exited" ? (
          <div className="mb-1 px-1 text-[length:var(--font-hint)] text-destructive">
            Failed to start terminal: {spawnError}
          </div>
        ) : null}
        <div ref={containerRef} className="terminal-xterm h-full w-full" />
      </div>
    </TerminalInsertHost>
  );
}
