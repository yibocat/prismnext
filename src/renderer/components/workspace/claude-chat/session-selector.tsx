import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { HistoryIcon, CheckIcon, Loader2Icon } from "lucide-react";

interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function SessionSelector() {
  const sessionId = useClaudeChatStore((s) => s.sessionId);
  const loadSession = useClaudeChatStore((s) => s.loadSession);
  const newSession = useClaudeChatStore((s) => s.newSession);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const fetchSessions = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.claudeListSessions(projectRoot);
      setSessions(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    if (!open) return;
    fetchSessions();
  }, [open, fetchSessions]);

  // Position dropdown relative to button using fixed positioning (avoids clipping)
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleLoadSession = useCallback(async (sid: string) => {
    setOpen(false);
    try {
      await loadSession(sid);
    } catch (err) {
      // Error is handled in the store
    }
  }, [loadSession]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isStreaming}
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
        title="Session history"
      >
        <HistoryIcon className="size-3.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-64 rounded-lg border border-border bg-background shadow-lg"
            style={{
              top: dropdownPos.top,
              right: dropdownPos.right,
              zIndex: 9999,
            }}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-border border-b">
              <span className="font-medium text-muted-foreground text-xs">Sessions</span>
              {error && <span className="text-destructive text-xs">{error}</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground text-xs text-center">
                No previous sessions
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => handleLoadSession(s.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs">{s.title}</div>
                      <div className="text-muted-foreground text-xs">
                        {relativeTime(s.lastModified)}
                      </div>
                    </div>
                    {s.id === sessionId && (
                      <CheckIcon className="size-3 shrink-0 text-green-500" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="border-border border-t">
              <button
                className="flex w-full items-center gap-1.5 rounded-b-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                onClick={() => {
                  newSession();
                  setOpen(false);
                }}
              >
                <span className="text-muted-foreground">+</span> New Chat
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
