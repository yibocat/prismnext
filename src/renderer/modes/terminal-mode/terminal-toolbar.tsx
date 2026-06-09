import { useCallback } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { PlusIcon, XCircleIcon, EraserIcon, Terminal as TerminalIcon } from "lucide-react";

interface TerminalToolbarProps {
  tabId: string;
  tabTitle: string;
}

export function TerminalToolbar({ tabId, tabTitle }: TerminalToolbarProps) {
  const newTerminalTab = useRightPanelStore((s) => s.newTerminalTab);
  // Resolve the full session ID (with generation suffix) for IPC calls
  const sessionId = useTerminalStore((s) => s.sessionIds[tabId]);

  const handleKill = useCallback(() => {
    if (!sessionId) return;
    window.electronAPI.terminalWrite({ sessionId, data: "\x03" });
  }, [sessionId]);

  const handleClear = useCallback(() => {
    if (!sessionId) return;
    window.electronAPI.terminalWrite({ sessionId, data: "clear\r" });
  }, [sessionId]);

  const handleNewTab = useCallback(() => {
    newTerminalTab();
  }, [newTerminalTab]);

  return (
    <>
      <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />

      <span className="text-[length:var(--font-size-12)] text-muted-foreground truncate max-w-[200px]">
        {tabTitle}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Clear Screen"
        onClick={handleClear}
      >
        <EraserIcon className="size-3.5" />
      </button>

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Interrupt (Ctrl+C)"
        onClick={handleKill}
      >
        <XCircleIcon className="size-3.5" />
      </button>

      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="New Terminal"
        onClick={handleNewTab}
      >
        <PlusIcon className="size-3.5" />
      </button>
    </>
  );
}
