import { useState, useEffect, useCallback, useRef } from "react";
import { useLayoutStore } from "@/stores/layout-store";
import { useClaudeChatStore } from "@/stores/claude-chat-store";
import { useDocumentStore } from "@/stores/document-store";
import {
  PlusIcon,
  MessageSquareIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export function LeftSidebar() {
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);

  const sessionId = useClaudeChatStore((s) => s.sessionId);
  const isStreaming = useClaudeChatStore((s) => s.isStreaming);
  const loadSession = useClaudeChatStore((s) => s.loadSession);
  const newSession = useClaudeChatStore((s) => s.newSession);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!projectRoot) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.agentListSessions(projectRoot);
      setSessions(result);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Refresh after streaming stops
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      fetchSessions();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, fetchSessions]);

  // Refresh when a new session is created by the agent
  useEffect(() => {
    return window.electronAPI.onAgentSessionCreated(() => {
      fetchSessions();
    });
  }, [fetchSessions]);

  const refreshAndNavigate = useCallback(async () => {
    if (!projectRoot) return;
    try {
      const result = await window.electronAPI.agentListSessions(projectRoot);
      setSessions(result);
      // If there are remaining sessions, load the most recent one
      if (result.length > 0) {
        useClaudeChatStore.getState().loadSession(result[0].id);
      } else {
        useClaudeChatStore.getState().clearCurrentTab();
      }
    } catch {
      useClaudeChatStore.getState().clearCurrentTab();
    }
  }, [projectRoot]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sid: string) => {
      e.stopPropagation();
      try {
        if (!projectRoot) return;
        const result = await window.electronAPI.agentDeleteSession(projectRoot, sid);
        if (result.success) {
          if (sid === sessionId) {
            // Deleting current session → refresh list and navigate
            await refreshAndNavigate();
          } else {
            // Deleting non-current session → just remove from list
            setSessions((prev) => prev.filter((s) => s.id !== sid));
          }
        }
      } catch (err) {
        console.error("[left-sidebar] Delete error:", err);
      }
    },
    [projectRoot, sessionId, refreshAndNavigate],
  );

  if (!sidebarExpanded) return null;

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-card"
      style={{ width: sidebarWidth }}
    >
      {/* Header */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sessions
        </span>
        <button
          type="button"
          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="New Chat"
          onClick={() => newSession()}
        >
          <PlusIcon className="size-3" />
        </button>
      </div>

      {/* Session list */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-4">
            <p className="text-center text-[12px] leading-relaxed text-muted-foreground">
              <MessageSquareIcon className="size-5 mx-auto mb-2 opacity-30" />
              No sessions yet
              <span className="mt-1 block text-[10px] opacity-50">Open a project to start</span>
            </p>
          </div>
        ) : (
          sessions.map((s) => {
            const isActive = s.id === sessionId;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "group flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-muted cursor-pointer",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground",
                )}
                onClick={() => loadSession(s.id)}
                onKeyDown={(e) => { if (e.key === "Enter") loadSession(s.id); }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px]">{s.title}</span>
                    {isActive && isStreaming && (
                      <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-500" />
                    )}
                  </div>
                  <span className="text-[10px] opacity-50">{relativeTime(s.lastModified)}</span>
                </div>

                <button
                  type="button"
                  className="flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted-foreground/20"
                  onClick={(e) => handleDelete(e, s.id)}
                  title="Delete session"
                >
                  <Trash2Icon className="size-2.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-[5px] cursor-col-resize hover:bg-primary/30 z-10 transition-colors"
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startWidth = sidebarWidth;
          const onMove = (ev: MouseEvent) => {
            setSidebarWidth(Math.min(420, Math.max(160, startWidth + ev.clientX - startX)));
          };
          const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
          };
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        }}
      />
    </aside>
  );
}
