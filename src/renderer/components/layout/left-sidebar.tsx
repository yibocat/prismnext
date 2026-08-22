import { useState, useEffect, useCallback, useRef, useMemo, memo, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useFocusedModeId } from "@/lib/workspace/modes-from-tabs";
import { displayChatTitle } from "@/lib/i18n/display-chat-title";
import { useChatStore, type ChatStreamMessage } from "@/stores/chat-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useWindowState } from "@/hooks/use-window-state";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { fsDesktop } from "@/lib/desktop-api/fs";
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
  Minus,
  CircleAlert,
  Square,
  FolderIcon,
  PlusIcon,
} from "lucide-react";
import { SettingsSidebar, type SettingsCategory } from "@/components/modules/settings";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { WorkbenchAddMenu } from "@/components/layout/workbench-add-menu";
import { LeftNavButton, LeftNavButtonBar, leftNavPanelRefs } from "@/components/layout/left-nav-button";
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import { leftNavRegistry } from "@/lib/workspace/left-nav";
import { cn } from "@/lib/utils";
import { isGenericSessionTitle, resolveSessionTitle } from "@/lib/chat/session-title";
import { resolveSessionWorktreeContext } from "@/lib/git/session-worktree-context";
import {
  toggleArchiveSessionForProject,
  togglePinSessionForProject,
} from "@/lib/chat/session-ui-prefs";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  ensureWorkbenchProjectExpanded,
  groupSessionsByProject,
  isWorkbenchProjectExpanded,
  sameProjectPath,
  toggleWorkbenchProjectExpanded,
  useWorkbenchStore,
  type WorkbenchSessionRow,
} from "@/stores/workbench-store";
import { hasPendingPermission, usePermissionStore } from "@/stores/permission-store";
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
  projectId?: string;
  projectLastPath?: string;
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
      ||       x.directory !== y.directory
      || x.projectId !== y.projectId
      || x.projectLastPath !== y.projectLastPath
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

/** Stable store selector — only changes when user-set tab titles change. */
function selectTabUserTitleKey(state: {
  tabs: { sessionId: string | null; title: string; userTitleSet?: boolean }[];
}): string {
  const parts: string[] = [];
  for (const t of state.tabs) {
    if (t.userTitleSet && t.sessionId && t.title) {
      parts.push(`${t.sessionId}\x01${t.title}`);
    }
  }
  parts.sort();
  return parts.join("\0");
}

function tabUserTitlesFromKey(key: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!key) return map;
  for (const part of key.split("\0")) {
    const sep = part.indexOf("\x01");
    if (sep <= 0) continue;
    map.set(part.slice(0, sep), part.slice(sep + 1));
  }
  return map;
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
  const focusedMode = useFocusedModeId();
  const hasTexWorkspaceTab = useRightPanelStore((s) =>
    s.tabs.some((t) => t.kind === "texworkspace"),
  );
  const pinnedSessionIds = useLayoutStore((s) => s.pinnedSessionIds);
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
  const tabUserTitleKey = useChatStore(selectTabUserTitleKey);
  const tabUserTitlesBySession = useMemo(
    () => tabUserTitlesFromKey(tabUserTitleKey),
    [tabUserTitleKey],
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
  const clearCurrentTab = useChatStore((s) => s.clearCurrentTab);
  const cancelExecution = useChatStore((s) => s.cancelExecution);
  const pendingPermissions = usePermissionStore((s) => s.permissions);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const worktrees = useWorktreeStore((s) => s.worktrees);
  const members = useWorkbenchStore((s) => s.members);
  const defaultProjectId = useWorkbenchStore((s) => s.defaultProjectId);
  const focusProjectId = useWorkbenchStore((s) => s.focusProjectId);
  const expandedWorkbenchProjectIds = useLayoutStore((s) => s.expandedWorkbenchProjectIds);
  const setExpandedWorkbenchProjectIds = useLayoutStore((s) => s.setExpandedWorkbenchProjectIds);
  const newSession = useChatStore((s) => s.newSession);
  const focusProject = useDocumentStore((s) => s.focusProject);
  const [missingProjectIds, setMissingProjectIds] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const projectPathForSession = useCallback((sessionId: string) => {
    const row = sessionsRef.current.find((item) => item.id === sessionId);
    return row?.projectLastPath || projectRoot;
  }, [projectRoot]);

  const archiveSession = useCallback((sessionId: string) => {
    const root = projectPathForSession(sessionId);
    if (!root) return;
    void toggleArchiveSessionForProject(root, sessionId);
  }, [projectPathForSession]);

  const pinSession = useCallback((sessionId: string) => {
    const root = projectPathForSession(sessionId);
    if (!root) return;
    void togglePinSessionForProject(root, sessionId);
  }, [projectPathForSession]);

  const clearSessionUiPrefs = useCallback((sessionId: string) => {
    const root = projectPathForSession(sessionId);
    if (!root) return;
    if (archivedSessionIds.includes(sessionId)) {
      void toggleArchiveSessionForProject(root, sessionId);
    }
    if (pinnedSessionIds.includes(sessionId)) {
      void togglePinSessionForProject(root, sessionId);
    }
  }, [projectPathForSession, archivedSessionIds, pinnedSessionIds]);

  useEffect(() => {
    let cancelled = false;
    if (members.length === 0) {
      setMissingProjectIds(new Set());
      return;
    }
    void Promise.all(
      members.map(async (member) => {
        try {
          const ok = await fsDesktop.fsExists(member.lastPath);
          return [member.id, ok] as const;
        } catch {
          return [member.id, false] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setMissingProjectIds(new Set(rows.filter(([, ok]) => !ok).map(([id]) => id)));
    });
    return () => {
      cancelled = true;
    };
  }, [members]);

  const fetchSessions = useCallback(async (options?: FetchSessionsOptions) => {
    const targets = members.length > 0
      ? members
      : projectRoot
        ? [{ id: "", lastPath: projectRoot, displayName: "" }]
        : [];
    if (targets.length === 0) {
      setSessions([]);
      return;
    }
    const silent = options?.silent ?? sessionsRef.current.length > 0;
    if (!silent) setLoading(true);
    try {
      const listed = await Promise.all(targets.map(async (member) => {
        const rows = member.id
          ? await agentDesktop.agentListSessionsByProjectId(member.id)
          : await agentDesktop.agentListSessions(member.lastPath);
        return rows.map((s) => ({
          id: s.conversationId,
          title: s.title,
          lastModified: s.updatedAt,
          createdAt: s.createdAt,
          directory: s.directory,
          projectId: member.id,
          projectLastPath: member.lastPath,
        }));
      }));
      const result = listed.flat();
      useWorkbenchStore.getState().recordSessionProjects(
        Object.fromEntries(
          result.filter((s) => s.projectId).map((s) => [s.id, s.projectId]),
        ),
      );
      const chatStore = useChatStore.getState();
      const tabs = chatStore.tabs;
      const merged = result.map((s) => {
        const tab = tabs.find((t) => t.id === s.id || t.conversation?.conversationId === s.id);
        if (tab?.userTitleSet && tab.title) {
          return { ...s, title: tab.title };
        }
        if (s.title.startsWith("New Chat") && tab?.title && tab.title !== "New Chat") {
          return { ...s, title: tab.title };
        }
        return s;
      });

      for (const s of result) {
        if (!s.title.startsWith("New Chat")) {
          const tab = tabs.find((t) => t.id === s.id || t.conversation?.conversationId === s.id);
          if (tab && !tab.userTitleSet && tab.title !== s.title) {
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
  }, [members, projectRoot]);

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

  // Refresh titles after a turn ends so the first-send default title
  // can pick up the persisted Agent session title.
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

  // Prefer an open tab's explicit rename, then the live tab title, over
  // a generic persisted "New Chat" until the Agent store title lands.
  const enrichedSessions = useMemo(() => {
    return sessions.map((s) => {
      const userTitle = tabUserTitlesBySession.get(s.id);
      if (userTitle) {
        return { ...s, title: userTitle };
      }
      if (s.title.startsWith("New Chat") || s.title.startsWith("New session")) {
        const tabTitle = tabTitlesBySession.get(s.id);
        if (tabTitle) return { ...s, title: tabTitle };
      }
      return s;
    });
  }, [sessions, tabTitlesBySession, tabUserTitlesBySession]);

  const sortedSessions = [...enrichedSessions].sort((a, b) => {
    if (sessionSort === "created") return b.createdAt - a.createdAt;
    return b.lastModified - a.lastModified;
  });

  const sessionGroups = useMemo(
    () => groupSessionsByProject(
      members,
      sortedSessions.filter((s): s is SessionInfo & WorkbenchSessionRow => Boolean(s.projectId)),
    ),
    [members, sortedSessions],
  );

  const removeFromWorkbench = useCallback(async (projectId: string) => {
    const removed = members.find((member) => member.id === projectId);
    const next = await useWorkbenchStore.getState().removeProject(projectId);
    if (removed && sameProjectPath(removed.lastPath, projectRoot)) {
      await useDocumentStore.getState().focusProject(next.defaultLastPath);
    }
    void fetchSessionsRef.current({ silent: true });
  }, [members, projectRoot]);

  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedWorkbenchProjectIds(
      toggleWorkbenchProjectExpanded(projectId, expandedWorkbenchProjectIds, focusProjectId),
    );
  }, [expandedWorkbenchProjectIds, focusProjectId, setExpandedWorkbenchProjectIds]);

  const newSessionInProject = useCallback(async (projectId: string, lastPath: string) => {
    setExpandedWorkbenchProjectIds(
      ensureWorkbenchProjectExpanded(projectId, expandedWorkbenchProjectIds, focusProjectId),
    );
    await focusProject(lastPath);
    newSession();
    setLeftSidebarOverlay(false);
  }, [
    expandedWorkbenchProjectIds,
    focusProject,
    focusProjectId,
    newSession,
    setExpandedWorkbenchProjectIds,
    setLeftSidebarOverlay,
  ]);

  const renderSessionItem = (s: SessionInfo) => {
    const isActive = s.id === sessionId;
    const isSessionStreaming = streamingSessionIds.has(s.id);
    const isAiTerminalRunning = aiTerminalRunningSessionIds.has(s.id);
    const isWaitingPermission = hasPendingPermission(pendingPermissions, s.id);
    const checkoutContext = resolveSessionWorktreeContext(
      s.directory,
      s.projectLastPath || projectRoot,
      worktrees,
    );
    const isWorktreeSession = checkoutContext.kind !== "local";
    return (
      <SidebarMenuItem key={s.id} data-workbench-session={s.id}>
        <SidebarMenuButton
          onClick={() => {
            if (s.projectId) {
              setExpandedWorkbenchProjectIds(
                ensureWorkbenchProjectExpanded(
                  s.projectId,
                  useLayoutStore.getState().expandedWorkbenchProjectIds,
                  useWorkbenchStore.getState().focusProjectId,
                ),
              );
            }
            loadSession(s.id, s.directory, s.projectLastPath);
            setLeftSidebarOverlay(false);
          }}
          isActive={isActive}
          size="sm"
        >
          <span className="relative size-3.5 shrink-0 flex items-center justify-center">
            {isWaitingPermission ? (
              <CircleAlert className="absolute size-3.5 text-warning" strokeWidth={2.5} />
            ) : isWorktreeSession ? (
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
          {isSessionStreaming ? (
            <Hint label={t("nav.sessions.stopSession")}>
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  void cancelExecution(s.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    void cancelExecution(s.id);
                  }
                }}
              >
                <Square className="size-3" />
              </span>
            </Hint>
          ) : (
            <span className="hidden group-hover/menu-item:inline text-[length:var(--font-timestamp)] text-muted-foreground/70 shrink-0">
              {relativeTime(s.lastModified, t)}
            </span>
          )}
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
                    const result = await agentDesktop.agentDeleteSession({ conversationId: s.id });
                    if (result.ok) {
                      clearSessionUiPrefs(s.id);
                      setSessions((prev) => prev.filter((x) => x.id !== s.id));
                      if (s.id === sessionId) clearCurrentTab();
                    }
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      if (!projectRoot) return;
                      const result = await agentDesktop.agentDeleteSession({ conversationId: s.id });
                      if (result.ok) {
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
          {/* 导航按钮由 leftNavRegistry 驱动，新增入口见 left-nav/items.tsx */}
          <LeftNavButtonBar
            items={primaryNavItems}
            panelRefs={navPanelRefs}
            onPressed={dismissOverlay}
          />
        </div>

        {/* ── Scrollable workbench tree ── */}
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-1">
          <div className="pt-2 pb-1 flex items-center justify-between">
            <span className="text-[length:var(--font-hint)] font-medium uppercase tracking-wider text-muted-foreground/50">
              {showArchived ? t("nav.sessions.archived") : t("nav.workbench.title")}
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
              <WorkbenchAddMenu />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
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
            sessionGroups.map(({ member, sessions: groupSessions }) => {
              const missing = missingProjectIds.has(member.id);
              const expanded = isWorkbenchProjectExpanded(
                member.id,
                expandedWorkbenchProjectIds,
                focusProjectId,
              );
              const pinned = groupSessions.filter((s) => {
                if (showArchived) return false;
                return pinnedSessionIds.includes(s.id) && !archivedSessionIds.includes(s.id);
              });
              const rest = groupSessions.filter((s) => {
                if (showArchived) return archivedSessionIds.includes(s.id);
                return !archivedSessionIds.includes(s.id) && !pinnedSessionIds.includes(s.id);
              });
              const visible = [...pinned, ...rest];
              return (
                <div key={member.id}>
                  <div className="group/project flex items-center gap-0.5">
                    <button
                      type="button"
                      data-workbench-project={member.id}
                      className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 py-1 text-left hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      onClick={() => toggleProjectExpanded(member.id)}
                    >
                      {expanded ? (
                        <ChevronDown className="size-3 shrink-0 text-muted-foreground/50" />
                      ) : (
                        <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />
                      )}
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-[length:var(--font-session-item)] font-medium">
                        {member.displayName}
                      </span>
                      {missing ? (
                        <span className="truncate text-[length:var(--font-hint)] text-muted-foreground/70">
                          {t("nav.workbench.missingFolder")}
                        </span>
                      ) : null}
                    </button>
                    {missing ? null : (
                      <Hint label={t("nav.workbench.newSessionInProject")}>
                        <button
                          type="button"
                          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground group-hover/project:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void newSessionInProject(member.id, member.lastPath);
                          }}
                        >
                          <PlusIcon className="size-3" />
                        </button>
                      </Hint>
                    )}
                    {member.id !== defaultProjectId ? (
                      <Hint label={t("nav.project.removeFromWorkbench")}>
                        <button
                          type="button"
                          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:text-muted-foreground group-hover/project:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeFromWorkbench(member.id);
                          }}
                        >
                          <Minus className="size-3" />
                        </button>
                      </Hint>
                    ) : null}
                  </div>
                  {expanded ? (
                    missing ? (
                      <p className="pl-6 pr-1 pb-1 text-[length:var(--font-hint)] text-muted-foreground/70">
                        {t("nav.workbench.missingFolder")}
                      </p>
                    ) : visible.length === 0 ? (
                      <p className="pl-6 pr-1 pb-1 text-[length:var(--font-hint)] text-muted-foreground/70">
                        {t("nav.workbench.emptyProject")}
                      </p>
                    ) : (
                      <SidebarMenu className="pl-3">
                        {visible.map(renderSessionItem)}
                      </SidebarMenu>
                    )
                  ) : null}
                </div>
              );
            })
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
