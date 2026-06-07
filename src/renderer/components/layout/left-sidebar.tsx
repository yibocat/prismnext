import { useState, useEffect, useCallback, useRef, useMemo, memo, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { useChatStore } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useWindowState } from "@/hooks/use-window-state";
import {
  Bot,
  FileType,
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
} from "lucide-react";
import { SettingsSidebar, type SettingsCategory } from "@/components/modules/settings";
import { Kbd } from "@/components/ui/kbd";
import { ProjectSwitcher } from "@/components/modules/shared";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { cn } from "@/lib/utils";
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
      const worktreePath = activeWorktree?.path;
      const result = await window.electronAPI.cliListSessions(projectRoot, worktreePath);
      setSessions(result);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [projectRoot, activeWorktree]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const prevAnyStreaming = useRef(hasAnyStreaming);
  useEffect(() => {
    if (prevAnyStreaming.current && !hasAnyStreaming) {
      fetchSessions();
    }
    prevAnyStreaming.current = hasAnyStreaming;
  }, [hasAnyStreaming, fetchSessions]);

  useEffect(() => {
    return window.electronAPI.onCliSessionCreated(() => {
      fetchSessions();
    });
  }, [fetchSessions]);

  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const setSettingsCategory = useLayoutStore((s) => s.setSettingsCategory);

  const sortedSessions = [...sessions].sort((a, b) => {
    if (sessionSort === "created") return b.createdAt - a.createdAt;
    return b.lastModified - a.lastModified;
  });

  const empty = !loading && sortedSessions.length === 0;

  const renderSessionItem = (s: SessionInfo) => {
    const isActive = s.id === sessionId;
    const isSessionStreaming = streamingSessionIds.has(s.id);
    return (
      <SidebarMenuItem key={s.id}>
        <SidebarMenuButton
          onClick={() => { loadSession(s.id); setLeftSidebarOverlay(false); }}
          isActive={isActive}
          size="sm"
        >
          <span className="relative size-3.5 shrink-0 flex items-center justify-center">
            {isSessionStreaming ? (
              <CircleDotDashed className="absolute size-3.5 text-primary transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2.5} />
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
                  const result = await window.electronAPI.cliDeleteSession(projectRoot, s.id);
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
                    const result = await window.electronAPI.cliDeleteSession(projectRoot, s.id);
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
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0 !w-full">
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
            onClick={() => { newSession(); setLeftSidebarOverlay(false); }}
          >
            <Bot className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-left">New Agent</span>
            <Kbd className="text-[length:var(--font-kbd)] h-4 min-w-4 px-0.5 bg-transparent">⌘N</Kbd>
          </button>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            onClick={() => {
              useRightPanelStore.getState().ensureTab("texworkspace");
              const st = useLayoutStore.getState();
              st.setRightToolbarTab("texworkspace");
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
                className="w-full px-2 py-1.5 flex items-center justify-between"
                onClick={togglePinnedExpanded}
              >
                <span className="text-[length:var(--font-sidebar-section)] font-medium uppercase tracking-wider text-muted-foreground/70">
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

          <div className="px-2 py-1.5 flex items-center justify-between">
            <span className="text-[length:var(--font-sidebar-section)] font-medium uppercase tracking-wider text-muted-foreground/70">
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
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--font-session-item)] text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
        </SidebarFooter>
      </Sidebar>
    </SidebarProvider>
  );

  return (
    <>
      {leftSidebarOverlay &&
        createPortal(
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col glass-content">
            <div className="flex-1 min-h-0">{sidebarContent}</div>
          </div>,
          document.body,
        )}
      {sidebarContent}
    </>
  );
});
