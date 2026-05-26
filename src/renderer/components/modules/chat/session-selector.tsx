import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { HistoryIcon, CheckIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Z_TOP } from "@/styles/constants";

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
  const tabs = useClaudeChatStore((s) => s.tabs);
  const loadSession = useClaudeChatStore((s) => s.loadSession);
  const newSession = useClaudeChatStore((s) => s.newSession);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevSessionId = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  const fetchSessions = useCallback(async (showLoading = true) => {
    const cwd = projectRoot || "";
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.agentListSessions(cwd);
      setSessions(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    if (!open) return;
    fetchSessions(true);
  }, [open, fetchSessions]);

  // Optimistic: when a new session ID appears, add it immediately to the list
  useEffect(() => {
    if (!sessionId || sessionId === prevSessionId.current) return;
    prevSessionId.current = sessionId;

    // Don't add if already in the list
    if (sessions.some((s) => s.id === sessionId)) return;

    // Find the tab with this session to get a title
    const tab = tabs.find((t) => t.sessionId === sessionId);
    const title = tab?.title || "New Chat";

    setSessions((prev) => [
      { id: sessionId, title, lastModified: Date.now() },
      ...prev,
    ]);

    // Also do a silent refresh from JSONL to get accurate data
    fetchSessions(false);
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleDelete = useCallback(async (e: React.MouseEvent, sid: string) => {
    e.stopPropagation();
    e.preventDefault();
    const cwd = projectRoot || "";
    const result = await window.electronAPI.agentDeleteSession(cwd, sid);
    if (result.success) {
      setSessions((prev) => prev.filter((s) => s.id !== sid));
    } else {
      setError(result.error || "Failed to delete session");
    }
  }, [projectRoot]);

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
              zIndex: Z_TOP,
            }}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-border border-b">
              <span className="font-medium text-muted-foreground text-[length:var(--font-session-item)]">Sessions</span>
              {error && <span className="text-destructive text-[length:var(--font-session-item)]">{error}</span>}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground text-[length:var(--font-session-item)] text-center">
                No previous sessions
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="group flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-[length:var(--font-file-tree-node)] transition-colors hover:bg-muted"
                    onClick={() => handleLoadSession(s.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") handleLoadSession(s.id); }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[length:var(--font-session-item)]">{s.title}</div>
                      <div className="text-muted-foreground text-[length:var(--font-session-item)]">
                        {relativeTime(s.lastModified)}
                      </div>
                    </div>
                    {s.id === sessionId && (
                      <CheckIcon className="size-3 shrink-0 text-green-500" />
                    )}
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer"
                      onClick={(e) => handleDelete(e, s.id)}
                      title="Delete session"
                    >
                      <Trash2Icon className="size-3 pointer-events-none" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border-border border-t">
              <button
                className="flex w-full items-center gap-1.5 rounded-b-lg px-3 py-1.5 text-left text-[length:var(--font-session-item)] transition-colors hover:bg-muted"
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
