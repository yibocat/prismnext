import { useState, useEffect, useCallback, useRef, useMemo, memo, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTheme } from "next-themes";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useWindowState } from "@/hooks/use-window-state";
import {
  Bot,
  FileType,
  LayoutTemplate,
  PinIcon,
  PinOff,
  Dot,
  CircleDotDashed,
  MessageSquareIcon,
  Loader2Icon,
  Archive,
  ArchiveRestore,
  Trash2Icon,
  SettingsIcon,
  ListFilter,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from "lucide-react";
import { SettingsSidebar, type SettingsCategory } from "@/components/modules/settings";
import { Kbd } from "@/components/ui/kbd";
import { ProjectSwitcher } from "@/components/modules/shared";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { cn } from "@/lib/utils";
import { isGenericSessionTitle, resolveSessionTitle } from "@/lib/chat/session-title";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  Sidebar,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
interface SessionInfo {
  id: string;
  title: string;
  lastModified: number;
  createdAt: number;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

interface LeftSidebarProps {
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
}

export const LeftSidebar = memo(function LeftSidebar({ leftSidebarRef, centerRef, rightAreaRef }: LeftSidebarProps) {
  const { platform, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen;
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const pinnedSessionIds = useLayoutStore((s) => s.pinnedSessionIds);
  const pinnedExpanded = useLayoutStore((s) => s.pinnedExpanded);
  const togglePinSession = useLayoutStore((s) => s.togglePinSession);
  const togglePinnedExpanded = useLayoutStore((s) => s.togglePinnedExpanded);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const showArchived = useLayoutStore((s) => s.showArchived);
  const toggleArchiveSession = useLayoutStore((s) => s.toggleArchiveSession);
  const toggleShowArchived = useLayoutStore((s) => s.toggleShowArchived);
  const sessionSort = useLayoutStore((s) => s.sessionSort);
  const setSessionSort = useLayoutStore((s) => s.setSessionSort);

  const sessionId = useChatStore((s) => s.sessionId);
  // Track which sessions are currently streaming across ALL tabs, not just the active one.
  // This ensures the running indicator (CircleDotDashed) remains visible when the user
  // switches away from a tab that is still executing.
  const tabs = useChatStore((s) => s.tabs);
  const streamingSessionIds = useMemo(
    () => new Set(tabs.filter((t) => t.isStreaming && t.sessionId).map((t) => t.sessionId as string)),
    [tabs],
  );
  const sessionStates = useTerminalAiStore((s) => s.sessionStates);
  const aiTerminalRunningSessionIds = useMemo(
    () => new Set(
      Object.values(sessionStates)
        .filter((st) => st.phase === "running")
        .map((st) => st.sessionId),
    ),
    [sessionStates],
  );
  const hasAnyStreaming = streamingSessionIds.size > 0;
  const loadSession = useChatStore((s) => s.loadSession);
  const newSession = useChatStore((s) => s.newSession);
  const clearCurrentTab = useChatStore((s) => s.clearCurrentTab);
  const projectRoot = useDocumentStore((s) => s.projectRoot);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const activeWorktree = useWorktreeStore((s) => s.activeWorktree);

  const fetchSessions = useCallback(async () => {
    if (!projectRoot) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const result = await window.electronAPI.sessionList(projectRoot);
      const chatStore = useChatStore.getState();
      const tabs = chatStore.tabs;
      const merged = result.map((s) => {
        if ((s.title.startsWith("New Chat") || s.title.startsWith("New session"))) {
          const tab = tabs.find((t) => t.sessionId === s.id);
          if (tab?.title && tab.title !== "New Chat") {
            return { ...s, title: tab.title };
          }
        }
        return s;
      });

      // Sync OpenCode-generated titles back to open tabs
      for (const s of result) {
        if (!(s.title.startsWith("New Chat") || s.title.startsWith("New session"))) {
          const tab = tabs.find((t) => t.sessionId === s.id);
          if (tab && tab.title !== s.title) {
            chatStore._setTitle(tab.id, s.title);
          }
        }
      }

      setSessions(merged);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const prevAnyStreaming = useRef(hasAnyStreaming);

  // Delayed title refresh: OpenCode generates conversation titles
  // asynchronously after session completion (≈2-3 second delay).
  // A one-shot timer picks up the real title without waiting for
  // the NEXT streaming exchange to trigger fetchSessions.
  const titleRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep a ref to the latest fetchSessions so the timer always uses
  // the current callback (with the correct projectRoot) even if the
  // user switches projects before the timer fires.
  const fetchSessionsRef = useRef(fetchSessions);
  fetchSessionsRef.current = fetchSessions;

  useEffect(() => {
    if (prevAnyStreaming.current && !hasAnyStreaming) {
      fetchSessions();
      // Schedule a delayed re-fetch so OpenCode's async title generation
      // has time to write the real title to SQLite.
      if (titleRefreshTimerRef.current) clearTimeout(titleRefreshTimerRef.current);
      titleRefreshTimerRef.current = setTimeout(() => {
        titleRefreshTimerRef.current = null;
        fetchSessionsRef.current();
      }, 3000);
    }
    prevAnyStreaming.current = hasAnyStreaming;
  }, [hasAnyStreaming, fetchSessions]);

  // Clean up the delayed title refresh timer on unmount
  useEffect(() => {
    return () => {
      if (titleRefreshTimerRef.current) clearTimeout(titleRefreshTimerRef.current);
    };
  }, []);

  // When a new session is created, insert it into the list immediately
  // with the tab's title — no async SQLite round-trip needed.
  // The next fetchSessions() call will refresh the list from disk.
  useEffect(() => {
    return window.electronAPI.onChatSessionCreated(({ tabId: eventTabId, sessionId }) => {
      const chatState = useChatStore.getState();
      const tab = chatState.tabs.find(
        (t) => t.id === (eventTabId || chatState.activeTabId),
      );
      const title =
        tab?.title && tab.title !== "New Chat"
          ? tab.title
          : "New Chat";
      setSessions((prev) => {
        if (prev.some((s) => s.id === sessionId)) return prev;
        // Prepend new session; fetchSessions will sort it correctly later
        return [
          {
            id: sessionId,
            title,
            lastModified: Date.now(),
            createdAt: Date.now(),
          },
          ...prev,
        ];
      });
    });
  }, []);

  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const setSettingsCategory = useLayoutStore((s) => s.setSettingsCategory);

  // Build a sessionId → tab-title map from currently open tabs.
  // This provides instant titles for newly created sessions without
  // waiting for OpenCode to write messages to SQLite.
  const tabTitlesBySession = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tabs) {
      if (!t.sessionId) continue;
      const title = resolveSessionTitle(t);
      if (title && !isGenericSessionTitle(title)) {
        map.set(t.sessionId, title);
      }
    }
    return map;
  }, [tabs]);

  // Derive enriched sessions: inject tab titles into sessions with generic
  // OpenCode defaults. Because this is a useMemo on both sessions AND tabs,
  // titles update instantly when the tab's sessionId + title are set —
  // no need to wait for the next fetchSessions round-trip.
  const enrichedSessions = useMemo(() => {
    return sessions.map((s) => {
      if ((s.title.startsWith("New Chat") || s.title.startsWith("New session"))) {
        const tabTitle = tabTitlesBySession.get(s.id);
        if (tabTitle) return { ...s, title: tabTitle };
      }
      return s;
    });
  }, [sessions, tabTitlesBySession]);

  const sortedSessions = [...enrichedSessions].sort((a, b) => {
    if (sessionSort === "created") return b.createdAt - a.createdAt;
    return b.lastModified - a.lastModified;
  });

  const empty = !loading && sortedSessions.length === 0;

  const renderSessionItem = (s: SessionInfo) => {
    const isActive = s.id === sessionId;
    const isSessionStreaming = streamingSessionIds.has(s.id);
    const isAiTerminalRunning = aiTerminalRunningSessionIds.has(s.id);
    return (
      <SidebarMenuItem key={s.id}>
        <SidebarMenuButton
          onClick={() => {
            loadSession(s.id);
            setLeftSidebarOverlay(false);
          }}
          isActive={isActive}
          size="sm"
        >
          <span className="relative size-3.5 shrink-0 flex items-center justify-center">
            {isSessionStreaming ? (
              <CircleDotDashed className="absolute size-3.5 text-primary transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2.5} />
            ) : isAiTerminalRunning ? (
              <CircleDotDashed className="absolute size-3.5 text-warning transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2.5} />
            ) : (
              <Dot className="absolute size-3.5 text-muted-foreground/30 transition-opacity group-hover/menu-item:opacity-0" strokeWidth={5.5} />
            )}
            <span
              role="button"
              tabIndex={0}
              className="absolute opacity-0 group-hover/menu-item:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={(e) => { e.stopPropagation(); togglePinSession(s.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); togglePinSession(s.id); } }}
              title={pinnedSessionIds.includes(s.id) ? "Unpin session" : "Pin session"}
            >
              {pinnedSessionIds.includes(s.id) ? (
                <PinOff className="size-3.5" strokeWidth={1.5} />
              ) : (
                <PinIcon className="size-3.5" strokeWidth={1.5} />
              )}
            </span>
          </span>
          <span className="truncate text-[length:var(--font-session-item)] flex-1">{s.title}</span>
          <span className="hidden group-hover/menu-item:inline text-[length:var(--font-timestamp)] text-muted-foreground/70 shrink-0">
            {relativeTime(s.lastModified)}
          </span>
          {showArchived ? (
            <>
              <span
                role="button"
                tabIndex={0}
                className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); toggleArchiveSession(s.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggleArchiveSession(s.id); } }}
                title="Restore from archive"
              >
                <ArchiveRestore className="size-3" />
              </span>
              <span
                role="button"
                tabIndex={0}
                className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!projectRoot) return;
                  const result = await window.electronAPI.sessionDelete(s.id, projectRoot);
                  if (result.success) {
                    if (archivedSessionIds.includes(s.id)) toggleArchiveSession(s.id);
                    if (pinnedSessionIds.includes(s.id)) togglePinSession(s.id);
                    setSessions((prev) => prev.filter((x) => x.id !== s.id));
                    if (s.id === sessionId) clearCurrentTab();
                  }
                }}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    if (!projectRoot) return;
                    const result = await window.electronAPI.sessionDelete(s.id, projectRoot);
                    if (result.success) {
                      if (archivedSessionIds.includes(s.id)) toggleArchiveSession(s.id);
                      if (pinnedSessionIds.includes(s.id)) togglePinSession(s.id);
                      setSessions((prev) => prev.filter((x) => x.id !== s.id));
                      if (s.id === sessionId) clearCurrentTab();
                    }
                  }
                }}
                title="Delete permanently"
              >
                <Trash2Icon className="size-3" />
              </span>
            </>
          ) : (
            <span
              role="button"
              tabIndex={0}
              className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                toggleArchiveSession(s.id);
                if (s.id === sessionId) clearCurrentTab();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  toggleArchiveSession(s.id);
                  if (s.id === sessionId) clearCurrentTab();
                }
              }}
              title="Archive session"
            >
              <Archive className="size-3" />
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  if (leftSidebarView === "settings") {
    return (
      <SettingsSidebar
        activeCategory={settingsCategory as SettingsCategory}
        onSelectCategory={(id) => { setSettingsCategory(id); setLeftSidebarOverlay(false); }}
        leftSidebarRef={leftSidebarRef}
      />
    );
  }

  const sidebarContent = (
    <SidebarProvider
      defaultOpen
      className="contents"
    >
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0 !w-full" data-surface="sidebar">
        {/* SidebarTopBar — pseudo-titlebar. Always preserves height to avoid layout jump,
            but only renders controls when sidebar is expanded (ContentTopBar handles collapsed state). */}
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          {!sidebarFullyCollapsed && (
            <SidebarControls leftSidebarRef={leftSidebarRef!} showMacSpacer={showMacSpacer} showNewAgent={false} />
          )}
        </div>
        {/* ── Fixed function buttons (do not scroll) ── */}
        <div className="shrink-0 px-2 flex flex-col gap-1">
          <div>
            <ProjectSwitcher className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[length:var(--font-session-item)] font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors" />
          </div>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => { newSession(); useLayoutStore.getState().setLeftSidebarView("sessions"); setLeftSidebarOverlay(false); }}
          >
            <Bot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">New Agent</span>
            <Kbd className="text-[length:var(--font-kbd)] h-4 min-w-4 px-0.5 bg-transparent">⌘N</Kbd>
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => {
              const st = useLayoutStore.getState();
              st.setLeftSidebarView(
                st.leftSidebarView === "templates" ? "sessions" : "templates",
              );
              setLeftSidebarOverlay(false);
            }}
          >
            <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">Templates</span>
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => {
              useRightPanelStore.getState().ensureTab("texworkspace");
              const st = useLayoutStore.getState();
              st.setLeftSidebarView("sessions");
              st.activateMode("texworkspace");
              const r = rightAreaRef?.current;
              const c = centerRef?.current;
              if (!r || !c) return;
              if (r.isCollapsed()) r.expand();
              c.collapse();
              r.resize(9999);
              setLeftSidebarOverlay(false);
            }}
          >
            <FileType className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">TeX Workspace</span>
          </button>
        </div>

        {/* ── Scrollable session list ── */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-1">
          {sortedSessions.filter((s) => pinnedSessionIds.includes(s.id)).length > 0 && (
            <div>
              <button
                type="button"
                className="w-full pt-2 pb-1 flex items-center justify-between"
                onClick={togglePinnedExpanded}
              >
                <span className="text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Pinned
                </span>
                {pinnedExpanded ? <ChevronDown className="size-3 text-muted-foreground/50" /> : <ChevronRight className="size-3 text-muted-foreground/50" />}
              </button>
              {pinnedExpanded && (
                <SidebarMenu>
                  {sortedSessions
                    .filter((s) => !archivedSessionIds.includes(s.id) && pinnedSessionIds.includes(s.id))
                    .map(renderSessionItem)}
                </SidebarMenu>
              )}
            </div>
          )}

          <div className="pt-2 pb-1 flex items-center justify-between">
            <span className="text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50">
              {showArchived ? "Archived" : "Sessions"}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={cn(
                  "flex size-4 items-center justify-center rounded transition-colors",
                  showArchived ? "text-muted-foreground" : "text-muted-foreground/50 hover:text-muted-foreground",
                )}
                onClick={toggleShowArchived}
                title={showArchived ? "Show active sessions" : "Show archived"}
              >
                <Archive className="size-3" />
              </button>
              <button type="button" className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors" title="Filter">
                <ListFilter className="size-3" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors" title="Sort">
                    <ArrowUpDown className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-[length:var(--font-menu-item)]"
                    onClick={() => setSessionSort("updated")}
                  >
                    <span className={cn(sessionSort === "updated" && "text-foreground font-medium")}>Last updated</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 text-[length:var(--font-menu-item)]"
                    onClick={() => setSessionSort("created")}
                  >
                    <span className={cn(sessionSort === "created" && "text-foreground font-medium")}>Date created</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
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
              {sortedSessions
                .filter((s) => {
                  if (showArchived) return archivedSessionIds.includes(s.id);
                  return !archivedSessionIds.includes(s.id) && !pinnedSessionIds.includes(s.id);
                })
                .map(renderSessionItem)}
            </SidebarMenu>
          )}
        </div>
        <SidebarFooter className="px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              onClick={() => {
                const st = useLayoutStore.getState();
                const doc = useDocumentStore.getState();
                if (st.leftSidebarView === "settings" && !doc.projectRoot) {
                  doc.setShowWelcome(true);
                  st.setLeftSidebarView("sessions");
                } else {
                  st.setLeftSidebarView(st.leftSidebarView === "settings" ? "sessions" : "settings");
                }
                setLeftSidebarOverlay(false);
              }}
            >
              <SettingsIcon className="size-3.5 shrink-0" />
              <span>Settings</span>
            </button>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors shrink-0"
              title={`Theme: ${theme}`}
              onClick={cycleTheme}
            >
              {theme === "system" ? (
                <MonitorIcon className="size-3.5" />
              ) : resolvedTheme === "dark" ? (
                <SunIcon className="size-3.5" />
              ) : (
                <MoonIcon className="size-3.5" />
              )}
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );

  return (
    <>
      {leftSidebarOverlay &&
        createPortal(
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col" data-surface="content">
            <div className="flex-1 min-h-0">{sidebarContent}</div>
          </div>,
          document.body,
        )}
      {sidebarContent}
    </>
  );
});
