import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalTheme } from "@/hooks/use-terminal-theme";
import { useTerminalStore } from "@/stores/terminal-store";
import { useTabContext } from "@/lib/tab-context";
import { TerminalPlaceholder } from "./terminal-placeholder";
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
  const xtermTheme = useTerminalTheme();
  const addToHistory = useTerminalStore((s) => s.addToHistory);
  const { isActive } = useTabContext();

  // ─── Stable mount reference ───
  // The ref is read inside the effect so each mount (even strict-mode
  // double-mount) gets a fresh generation, but the CLOSE callback in
  // right-panel-store still uses `tab.id` without the generation suffix.
  // We bridge this by storing the current generation so closeTab can
  // find and destroy it.
  const mountGenRef = useRef(0);

  // ─── Initialize terminal ───

  useEffect(() => {
    if (!projectRoot || !containerRef.current) return;

    // Each mount (including strict-mode remount) uses a unique generation.
    // This prevents a late-arriving terminalDestroy from a previous
    // mount from killing the current session.
    const gen = ++_globalGen;
    mountGenRef.current = gen;
    const sessionId = `${tabId}:${gen}`;

    const container = containerRef.current;

    const term = new Terminal({
      theme: xtermTheme,
      fontSize: 13,
      fontFamily: "'Geist Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      cursorBlink: true,
      cursorStyle: "bar",
      drawBoldTextInBrightColors: true,
      cols: 80,
      rows: 24,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // ─── Spawn PTY ───
    window.electronAPI
      .terminalCreate({ sessionId, projectRoot })
      .then(({ shell, cwd, pid }) => {
        // Register session info for sidebar display
        useTerminalStore.getState().registerSession(tabId, sessionId, { shell, cwd, pid, busy: false });
        // Set tab title to the last directory name
        const dirName = cwd.split("/").filter(Boolean).pop() || cwd;
        useRightPanelStore.getState().updateTerminalTabTitle(tabId, dirName);
      })
      .catch((err) => {
        term.writeln(`\x1b[1;31mPTY failed: ${err}\x1b[0m`);
      });

    // ─── Input → PTY ───
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const onDataDisposable = term.onData((data) => {
      if (data === "\r") {
        // Mark busy when user submits a command
        useTerminalStore.getState().setBusy(tabId, true);
        const buffer = term.buffer.active;
        const line = buffer.getLine(buffer.baseY + buffer.cursorY);
        if (line) {
          const cmd = line.translateToString(true).trim();
          if (cmd) addToHistory(cmd);
        }
      }
      window.electronAPI.terminalWrite({ sessionId, data });
    });

    // ─── PTY output → display ───
    const unsubData = window.electronAPI.onTerminalData(({ sessionId: sid, data }) => {
      if (sid === sessionId) {
        term.write(data);
        // Debounce: after 400ms of no output, consider command finished
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          useTerminalStore.getState().setBusy(tabId, false);
        }, 400);
      }
    });

    // ─── PTY exit ───
    let exited = false;
    const unsubExit = window.electronAPI.onTerminalExit(({ sessionId: sid, exitCode }) => {
      if (sid === sessionId) {
        exited = true;
        useTerminalStore.getState().setBusy(tabId, false);
        if (idleTimer) clearTimeout(idleTimer);
        term.write(`\r\n\x1b[1;33m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
        term.writeln(`\x1b[2mPress Enter to restart, or close this tab\x1b[0m`);
      }
    });

    // ─── Restart on Enter after exit ───
    const restartOnEnter = term.onData((data) => {
      if (!exited) return;
      if (data === "\r") {
        exited = false;
        term.writeln("");
        // Respawn PTY
        window.electronAPI
          .terminalCreate({ sessionId, projectRoot })
          .then(({ shell, cwd, pid }) => {
            useTerminalStore.getState().registerSession(tabId, sessionId, { shell, cwd, pid, busy: false });
          })
          .catch((err) => {
            term.writeln(`\x1b[1;31mPTY failed: ${err}\x1b[0m`);
          });
      }
    });

    // ─── Fit + focus ───
    const fitAndFocus = () => {
      try { fitAddon.fit(); } catch { /* ignore */ }
      term.focus();
    };
    requestAnimationFrame(fitAndFocus);
    const t1 = setTimeout(fitAndFocus, 100);
    const t2 = setTimeout(() => term.focus(), 300);

    // ─── Resize ───
    const resizeObserver = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(container);

    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.electronAPI.terminalResize({ sessionId, cols, rows });
    });

    // ─── Cleanup ───
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      unsubData();
      unsubExit();
      onDataDisposable.dispose();
      restartOnEnter.dispose();
      if (idleTimer) clearTimeout(idleTimer);
      resizeObserver.disconnect();
      resizeDisposable.dispose();
      // Destroy THIS mount's PTY — the generation check ensures we
      // only destroy the session that belongs to this mount instance.
      window.electronAPI.terminalDestroy({ sessionId });
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [projectRoot, tabId]);

  // ─── Focus when tab becomes active ───

  useEffect(() => {
    if (isActive && termRef.current) {
      requestAnimationFrame(() => termRef.current?.focus());
      setTimeout(() => termRef.current?.focus(), 60);
      setTimeout(() => termRef.current?.focus(), 200);
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
    return <TerminalPlaceholder />;
  }

  return (
    <div
      className="h-full w-full p-1.5 glass-content"
      onMouseDown={handleMouseDown}
    >
      <div ref={containerRef} className="terminal-xterm h-full w-full" />
    </div>
  );
}
