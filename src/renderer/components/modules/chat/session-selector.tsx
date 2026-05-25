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
    const cwd = projectRoot || "";
    setLoading(true);
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

  const doDelete = useCallback(async (sid: string) => {
    console.log("[session-selector] Delete clicked:", sid);
    const cwd = projectRoot || "";
    const result = await window.electronAPI.agentDeleteSession(cwd, sid);
    console.log("[session-selector] Delete result:", result);
    if (result.success) {
      setSessions((prev) => prev.filter((s) => s.id !== sid));
    } else {
      setError(result.error || "Failed to delete session");
    }
  }, [projectRoot]);

  // Diagnostic: log every click inside the dropdown to verify event delivery
  useEffect(() => {
    const dropdown = dropdownRef.current;
    if (!open || !dropdown) return;
    const logClick = (e: Event) => {
      console.log("[session-selector] RAW CLICK target:", (e.target as Element)?.tagName, (e.target as Element)?.className, (e.target as Element)?.closest?.(".delete-session-btn") ? "IS DELETE BTN" : "not delete");
      const btn = (e.target as Element)?.closest?.(".delete-session-btn") as HTMLElement | null;
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        const sid = btn.dataset.sid;
        console.log("[session-selector] DELETE sid:", sid);
        if (sid) doDelete(sid);
      }
    };
    dropdown.addEventListener("click", logClick);
    return () => dropdown.removeEventListener("click", logClick);
  }, [open, doDelete]);

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
              <button
                type="button"
                className="bg-red-500 text-white px-2 py-0.5 rounded text-[length:var(--font-session-item)]"
                onClick={() => { console.log("[session-selector] TEST BTN CLICKED"); alert("TEST"); }}
              >
                TEST
              </button>
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
                      className="delete-session-btn shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all cursor-pointer"
                      data-sid={s.id}
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
