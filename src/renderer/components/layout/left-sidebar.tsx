import { useState, useEffect, useCallback, useRef, useMemo, memo, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { useChatStore, type ChatStreamMessage } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useWindowState } from "@/hooks/use-window-state";
import {
  PinIcon,
  PinOff,
  Dot,
  CircleDotDashed,
  MessageSquareIcon,
  Loader2Icon,
  Archive,
  ArchiveRestore,
  Trash2Icon,
  WorkflowIcon,
  ListFilter,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { SettingsSidebar, type SettingsCategory } from "@/components/modules/settings";
import { ProjectSwitcher } from "@/components/modules/shared";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { LeftNavButton, LeftNavButtonBar, leftNavPanelRefs } from "@/components/layout/left-nav-button";
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import { leftNavRegistry } from "@/lib/workspace/left-nav";
import { cn } from "@/lib/utils";
import { isGenericSessionTitle, resolveSessionTitle } from "@/lib/chat/session-title";
import { captureSessionCwd } from "@/lib/git/checkout-context";
import { resolveSessionWorktreeContext } from "@/lib/git/session-worktree-context";
import {
  toggleArchiveSessionForProject,
  togglePinSessionForProject,
} from "@/lib/chat/session-ui-prefs";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
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
  directory?: string;
}

type FetchSessionsOptions = {
  /** Keep showing the current list while refreshing — no loading spinner. */
  silent?: boolean;
};

function sessionsListEqual(a: SessionInfo[], b: SessionInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id
      || x.title !== y.title
      || x.lastModified !== y.lastModified
      || x.createdAt !== y.createdAt
      || x.directory !== y.directory
    ) {
      return false;
    }
  }
  return true;
}

/** Stable store selector — only changes when streaming session ids change. */
function selectStreamingSessionKey(state: { tabs: { isStreaming: boolean; sessionId: string | null }[] }): string {
  const ids: string[] = [];
  for (const t of state.tabs) {
    if (t.isStreaming && t.sessionId) ids.push(t.sessionId);
  }
  ids.sort();
  return ids.join("\0");
}

/** Stable store selector — only changes when non-generic tab titles change. */
function selectTabTitleKey(state: {
  tabs: { sessionId: string | null; title: string; messages: ChatStreamMessage[] }[];
}): string {
  const parts: string[] = [];
  for (const t of state.tabs) {
    if (!t.sessionId) continue;
    const title = resolveSessionTitle(t);
    if (title && !isGenericSessionTitle(title)) {
      parts.push(`${t.sessionId}\x01${title}`);
    }
  }
  parts.sort();
  return parts.join("\0");
}

function tabTitlesFromKey(key: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!key) return map;
  for (const part of key.split("\0")) {
    const sep = part.indexOf("\x01");
    if (sep === -1) continue;
    map.set(part.slice(0, sep), part.slice(sep + 1));
  }
  return map;
}

function relativeTime(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t("nav.sessions.justNow");
  if (sec < 3600) return t("nav.sessions.minutesAgo", { n: Math.floor(sec / 60) });
  if (sec < 86400) return t("nav.sessions.hoursAgo", { n: Math.floor(sec / 3600) });
  return t("nav.sessions.daysAgo", { n: Math.floor(sec / 86400) });
}

interface LeftSidebarProps {
  leftSidebarRef?: RefObject<PanelImperativeHandle | null>;
  centerRef?: RefObject<PanelImperativeHandle | null>;
  rightAreaRef?: RefObject<PanelImperativeHandle | null>;
}

export const LeftSidebar = memo(function LeftSidebar({ leftSidebarRef, centerRef, rightAreaRef }: LeftSidebarProps) {
  const { t } = useTranslation();
  const { platform, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";
  const showMacSpacer = isMac && !isFullscreen;

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const leftSidebarOverlay = useLayoutStore((s) => s.leftSidebarOverlay);
  const setLeftSidebarOverlay = useLayoutStore((s) => s.setLeftSidebarOverlay);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const focusedMode = useLayoutStore((s) => s.focusedMode);
  const hasTexWorkspaceTab = useRightPanelStore((s) =>
    s.tabs.some((t) => t.kind === "texworkspace"),
  );
  const pinnedSessionIds = useLayoutStore((s) => s.pinnedSessionIds);
  const pinnedExpanded = useLayoutStore((s) => s.pinnedExpanded);
  const togglePinnedExpanded = useLayoutStore((s) => s.togglePinnedExpanded);
  const archivedSessionIds = useLayoutStore((s) => s.archivedSessionIds);
  const showArchived = useLayoutStore((s) => s.showArchived);
  const toggleShowArchived = useLayoutStore((s) => s.toggleShowArchived);
  const sessionSort = useLayoutStore((s) => s.sessionSort);
  const setSessionSort = useLayoutStore((s) => s.setSessionSort);

  const sessionId = useChatStore((s) => s.sessionId);
  const streamingSessionKey = useChatStore(selectStreamingSessionKey);
  const streamingSessionIds = useMemo(
    () => new Set(streamingSessionKey ? streamingSessionKey.split("\0") : []),
    [streamingSessionKey],
  );
  const tabTitleKey = useChatStore(selectTabTitleKey);
  const tabTitlesBySession = useMemo(() => tabTitlesFromKey(tabTitleKey), [tabTitleKey]);
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
  const clearCurrentTab = useChatStore((s) => s.clearCurrentTab);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const worktrees = useWorktreeStore((s) => s.worktrees);

  const archiveSession = useCallback((sessionId: string) => {
    if (!projectRoot) return;
    void toggleArchiveSessionForProject(projectRoot, sessionId);
  }, [projectRoot]);

  const pinSession = useCallback((sessionId: string) => {
    if (!projectRoot) return;
    void togglePinSessionForProject(projectRoot, sessionId);
  }, [projectRoot]);

  const clearSessionUiPrefs = useCallback((sessionId: string) => {
    if (!projectRoot) return;
    if (archivedSessionIds.includes(sessionId)) {
      void toggleArchiveSessionForProject(projectRoot, sessionId);
    }
    if (pinnedSessionIds.includes(sessionId)) {
      void togglePinSessionForProject(projectRoot, sessionId);
    }
  }, [projectRoot, archivedSessionIds, pinnedSessionIds]);

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const fetchSessions = useCallback(async (options?: FetchSessionsOptions) => {
    if (!projectRoot) {
      setSessions([]);
      return;
    }
    const silent = options?.silent ?? sessionsRef.current.length > 0;
    if (!silent) setLoading(true);
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

      setSessions((prev) => (sessionsListEqual(prev, merged) ? prev : merged));
    } catch {
      if (!silent) setSessions([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [projectRoot]);

  const fetchSessionsRef = useRef(fetchSessions);
  fetchSessionsRef.current = fetchSessions;

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    const onRefresh = () => void fetchSessionsRef.current({ silent: true });
    window.addEventListener("prism:session-list-refresh", onRefresh);
    return () => window.removeEventListener("prism:session-list-refresh", onRefresh);
  }, []);

  const prevAnyStreaming = useRef(hasAnyStreaming);
  const prevStreamingSessionIds = useRef<Set<string>>(new Set());

  // Delayed title refresh: OpenCode generates conversation titles
  // asynchronously after session completion (≈2-3 second delay).
  // Only scheduled when a tab still has a generic title.
  const titleRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevAnyStreaming.current && !hasAnyStreaming) {
      const finishedIds = [...prevStreamingSessionIds.current];
      if (finishedIds.length > 0) {
        const now = Date.now();
        setSessions((prev) => {
          let changed = false;
          const next = prev.map((s) => {
            if (!finishedIds.includes(s.id)) return s;
            changed = true;
            return { ...s, lastModified: now };
          });
          return changed ? next : prev;
        });
      }

      void fetchSessions({ silent: true });

      const chatState = useChatStore.getState();
      const needsTitleRefresh = chatState.tabs.some((t) => {
        if (!t.sessionId) return false;
        const title = resolveSessionTitle(t);
        return title == null || isGenericSessionTitle(title);
      });
      if (needsTitleRefresh) {
        if (titleRefreshTimerRef.current) clearTimeout(titleRefreshTimerRef.current);
        titleRefreshTimerRef.current = setTimeout(() => {
          titleRefreshTimerRef.current = null;
          void fetchSessionsRef.current({ silent: true });
        }, 3000);
      }
    }
    prevStreamingSessionIds.current = new Set(streamingSessionIds);
    prevAnyStreaming.current = hasAnyStreaming;
  }, [hasAnyStreaming, fetchSessions, streamingSessionIds]);

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
      const directory = tab?.sessionCwd ?? captureSessionCwd() ?? undefined;
      setSessions((prev) => {
        if (prev.some((s) => s.id === sessionId)) return prev;
        return [
          {
            id: sessionId,
            title,
            lastModified: Date.now(),
            createdAt: Date.now(),
            directory,
          },
          ...prev,
        ];
      });
    });
  }, []);

  const primaryNavItems = useMemo(
    () => leftNavRegistry.getBySection("primary"),
    [leftSidebarView, rightAreaExpanded, focusedMode, hasTexWorkspaceTab],
  );
  const footerNavItems = useMemo(
    () => leftNavRegistry.getBySection("footer"),
    [leftSidebarView, rightAreaExpanded, focusedMode, hasTexWorkspaceTab],
  );
  const navPanelRefs = leftNavPanelRefs({ centerRef, rightAreaRef });
  const dismissOverlay = () => setLeftSidebarOverlay(false);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const setSettingsCategory = useLayoutStore((s) => s.setSettingsCategory);

  // Derive enriched sessions: inject tab titles into sessions with generic
  // OpenCode defaults. Because this is a useMemo on both sessions AND tab titles,
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
    const checkoutContext = resolveSessionWorktreeContext(s.directory, projectRoot, worktrees);
    const isWorktreeSession = checkoutContext.kind !== "local";
    return (
      <SidebarMenuItem key={s.id}>
        <SidebarMenuButton
          onClick={() => {
            loadSession(s.id, s.directory);
            setLeftSidebarOverlay(false);
          }}
          isActive={isActive}
          size="sm"
        >
          <span className="relative size-3.5 shrink-0 flex items-center justify-center">
            {isWorktreeSession ? (
              <WorkflowIcon className="absolute size-3 text-primary/70 transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2} />
            ) : isSessionStreaming ? (
              <CircleDotDashed className="absolute size-3.5 text-primary transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2.5} />
            ) : isAiTerminalRunning ? (
              <CircleDotDashed className="absolute size-3.5 text-warning transition-opacity group-hover/menu-item:opacity-0" strokeWidth={2.5} />
            ) : (
              <Dot className="absolute size-3.5 text-muted-foreground/30 transition-opacity group-hover/menu-item:opacity-0" strokeWidth={5.5} />
            )}
            <Hint
              label={
                pinnedSessionIds.includes(s.id)
                  ? t("nav.sessions.unpin")
                  : t("nav.sessions.pin")
              }
            >
              <span
                role="button"
                tabIndex={0}
                className="absolute opacity-0 group-hover/menu-item:opacity-100 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); pinSession(s.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); pinSession(s.id); } }}
              >
                {pinnedSessionIds.includes(s.id) ? (
                  <PinOff className="size-3.5" strokeWidth={1.5} />
                ) : (
                  <PinIcon className="size-3.5" strokeWidth={1.5} />
                )}
              </span>
            </Hint>
          </span>
          <span className="truncate text-[length:var(--font-session-item)] flex-1">{displayChatTitle(s.title, t)}</span>
          <span className="hidden group-hover/menu-item:inline text-[length:var(--font-timestamp)] text-muted-foreground/70 shrink-0">
            {relativeTime(s.lastModified, t)}
          </span>
          {showArchived ? (
            <>
              <Hint label={t("nav.sessions.restoreFromArchive")}>
                <span
                  role="button"
                  tabIndex={0}
                  className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); archiveSession(s.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); archiveSession(s.id); } }}
                >
                  <ArchiveRestore className="size-3" />
                </span>
              </Hint>
              <Hint label={t("nav.sessions.delete")}>
                <span
                  role="button"
                  tabIndex={0}
                  className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!projectRoot) return;
                    const result = await window.electronAPI.sessionDelete(s.id, projectRoot);
                    if (result.success) {
                      clearSessionUiPrefs(s.id);
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
                        clearSessionUiPrefs(s.id);
                        setSessions((prev) => prev.filter((x) => x.id !== s.id));
                        if (s.id === sessionId) clearCurrentTab();
                      }
                    }
                  }}
                >
                  <Trash2Icon className="size-3" />
                </span>
              </Hint>
            </>
          ) : (
            <Hint label={t("nav.sessions.archive")}>
              <span
                role="button"
                tabIndex={0}
                className="hidden group-hover/menu-item:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  archiveSession(s.id);
                  if (s.id === sessionId) clearCurrentTab();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    archiveSession(s.id);
                    if (s.id === sessionId) clearCurrentTab();
                  }
                }}
              >
                <Archive className="size-3" />
              </span>
            </Hint>
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

          {/* 导航按钮由 leftNavRegistry 驱动，新增入口见 left-nav/items.tsx */}
          <LeftNavButtonBar
            items={primaryNavItems}
            panelRefs={navPanelRefs}
            onPressed={dismissOverlay}
          />
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
                  {t("nav.sessions.pinned")}
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
              {showArchived ? t("nav.sessions.archived") : t("nav.sessions.sessions")}
            </span>
            <div className="flex items-center gap-0.5">
              <Hint
                label={showArchived ? t("nav.sessions.showActive") : t("nav.sessions.showArchived")}
              >
                <button
                  type="button"
                  className={cn(
                    "flex size-4 items-center justify-center rounded transition-colors",
                    showArchived ? "text-muted-foreground" : "text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                  onClick={toggleShowArchived}
                >
                  <Archive className="size-3" />
                </button>
              </Hint>
              <Hint label={t("nav.sessions.filter")}>
                <button type="button" className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <ListFilter className="size-3" />
                </button>
              </Hint>
              <AppMenu>
                <Hint label={t("nav.sessions.sort")}>
                  <AppMenuTrigger asChild>
                    <button type="button" className="flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                      <ArrowUpDown className="size-3" />
                    </button>
                  </AppMenuTrigger>
                </Hint>
                <AppMenuContent align="end" className="min-w-[8.5rem]">
                  <AppMenuCheckItem
                    selected={sessionSort === "updated"}
                    onClick={() => setSessionSort("updated")}
                  >
                    {t("nav.sessions.lastUpdated")}
                  </AppMenuCheckItem>
                  <AppMenuCheckItem
                    selected={sessionSort === "created"}
                    onClick={() => setSessionSort("created")}
                  >
                    {t("nav.sessions.dateCreated")}
                  </AppMenuCheckItem>
                </AppMenuContent>
              </AppMenu>
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
                {t("nav.sessions.noSessions")}
                <span className="mt-1 block text-[length:var(--font-hint)] opacity-50">
                  {t("nav.sessions.openProjectHint")}
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
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              {footerNavItems.map((item) => (
                <LeftNavButton
                  key={item.id}
                  item={item}
                  panelRefs={navPanelRefs}
                  onPressed={dismissOverlay}
                />
              ))}
            </div>
            <SidebarUpdateButton />
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
