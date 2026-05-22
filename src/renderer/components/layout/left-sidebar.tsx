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
import { Button } from "@/components/ui/button";
import { SIDEBAR_LEFT_MIN, SIDEBAR_LEFT_MAX } from "@/styles/constants";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar";

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

  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      fetchSessions();
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, fetchSessions]);

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
            await refreshAndNavigate();
          } else {
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

  const empty = !loading && sessions.length === 0;

  return (
    <SidebarProvider defaultOpen className="contents">
      <Sidebar
        className="relative shrink-0 border-r border-border bg-card"
        style={{ width: sidebarWidth, "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <SidebarHeader className="flex h-[var(--height-sessions-header)] shrink-0 flex-row items-center justify-between border-b border-border px-3">
          <span className="text-[length:var(--font-sidebar-section)] font-semibold uppercase tracking-wider text-muted-foreground">
            Sessions
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title="New Chat"
            onClick={() => newSession()}
          >
            <PlusIcon className="size-3" />
          </Button>
        </SidebarHeader>

        <SidebarContent className="px-2 py-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : empty ? (
            <div className="flex flex-1 items-center justify-center px-4">
              <p className="text-center text-[length:var(--font-session-item)] leading-relaxed text-muted-foreground">
                <MessageSquareIcon className="size-5 mx-auto mb-2 opacity-30" />
                No sessions yet
                <span className="mt-1 block text-[length:var(--font-hint)] opacity-50">
                  Open a project to start
                </span>
              </p>
            </div>
          ) : (
            <SidebarMenu>
              {sessions.map((s) => {
                const isActive = s.id === sessionId;
                return (
                  <SidebarMenuItem key={s.id}>
                    <SidebarMenuButton
                      onClick={() => loadSession(s.id)}
                      isActive={isActive}
                      size="sm"
                    >
                      <span className="truncate text-[length:var(--font-session-item)]">{s.title}</span>
                      <span className="shrink-0 text-[length:var(--font-timestamp)] opacity-50">
                        {relativeTime(s.lastModified)}
                      </span>
                      {isActive && isStreaming && (
                        <Loader2Icon className="size-3 shrink-0 animate-spin text-blue-500" />
                      )}
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={(e) => handleDelete(e, s.id)}
                      showOnHover
                      className="[&>svg]:!size-2.5"
                      title="Delete session"
                    >
                      <Trash2Icon />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
        </SidebarContent>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-[var(--layout-resize-handle)] cursor-col-resize hover:bg-primary/30 z-[var(--z-base)] transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = sidebarWidth;
            const onMove = (ev: MouseEvent) => {
              setSidebarWidth(
                Math.min(SIDEBAR_LEFT_MAX, Math.max(SIDEBAR_LEFT_MIN, startWidth + ev.clientX - startX)),
              );
            };
            const onUp = () => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          }}
        />
      </Sidebar>
    </SidebarProvider>
  );
}
