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
  Clock,
  Folder,
  CircleAlert,
  Square,
  ChevronRight,
  PlusIcon,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import { SettingsSidebar, type SettingsCategory } from "@/components/modules/settings";
import { SidebarHitChrome } from "@/components/layout/sidebar-controls";
import { WorkbenchAddMenu } from "@/components/layout/workbench-add-menu";
import {
  LeftNavButtonBar,
  LeftNavIconButton,
  LEFT_SIDEBAR_FOOTER_ICON,
  LEFT_SIDEBAR_ROW,
  LEFT_SIDEBAR_ROW_ACTION,
  LEFT_SIDEBAR_ROW_ACTIVE,
  LEFT_SIDEBAR_ROW_HOVER,
  LEFT_SIDEBAR_SECTION_ACTION,
  LEFT_SIDEBAR_SECTION_ACTION_ICON,
  LEFT_SIDEBAR_SECTION_HEADER,
  LEFT_SIDEBAR_SECTION_LABEL,
  LEFT_SIDEBAR_STACK,
  LEFT_SIDEBAR_AFTER_COLLAPSE,
  LEFT_SIDEBAR_AFTER_EXPAND,
  LeftSidebarReveal,
  DefaultProjectBadge,
  WorkbenchFolderGlyph,
  leftNavPanelRefs,
} from "@/components/layout/left-nav-button";
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import { SessionContextCard } from "@/components/layout/content-top-bar/session-context-card";
import {
  isLeftNavRequired,
  leftNavRegistry,
  resolvePrimaryNavItems,
} from "@/lib/workspace/left-nav";
import { useSettingsStore } from "@/stores/settings-store";
import { CustomizeSidebarDialog } from "@/components/layout/customize-sidebar-dialog";
import { cn } from "@/lib/utils";
import { isGenericSessionTitle, resolveSessionTitle } from "@/lib/chat/session-title";
import { resolveSessionWorktreeContext } from "@/lib/git/session-worktree-context";
import {
  archiveSessionsForProject,
  toggleArchiveSessionForProject,
  togglePinSessionForProject,
} from "@/lib/chat/session-ui-prefs";
import { EditProjectDialog } from "@/components/modules/project/edit-project-dialog";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuDestructiveItem,
  AppContextMenuItem,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import { useWorktreeStore } from "@/stores/worktree-store";
import {
  ensureWorkbenchProjectExpanded,
  anyWorkbenchProjectExpanded,
  applyVisibleIdReorder,
  groupSessionsByProject,
  groupSessionsByUpdatedAt,
  isWorkbenchProjectExpanded,
  moveListItem,
  type SessionDateBucket,
  sameProjectPath,
  toggleWorkbenchProjectExpanded,
  useWorkbenchStore,
  type WorkbenchSessionRow,
} from "@/stores/workbench-store";
import { useVerticalListReorder } from "@/lib/workspace/vertical-list-reorder";
import { hasPendingPermission, usePermissionStore } from "@/stores/permission-store";
import {
  AppMenu,
  AppMenuCheckItem,
  AppMenuContent,
  AppMenuItem,
  AppMenuSub,
  AppMenuSubContent,
  AppMenuSubTrigger,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { Hint } from "@/components/ui/hint";
import {
  SidebarProvider,
  Sidebar,
  SidebarFooter,
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

function shortProjectPath(lastPath: string): string {
  const normalized = lastPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/") || normalized;
  return parts.slice(-2).join("/");
}

function projectMetaForSession(
  session: SessionInfo,
  members: { id: string; lastPath: string; displayName: string }[],
): { id?: string; name: string; path: string; lastPath: string } | null {
  const member =
    (session.projectId
      ? members.find((item) => item.id === session.projectId)
      : undefined)
    ?? members.find((item) => sameProjectPath(item.lastPath, session.projectLastPath));
  if (member) {
    return {
      id: member.id,
      name: member.displayName,
      path: shortProjectPath(member.lastPath),
      lastPath: member.lastPath,
    };
  }
  if (!session.projectLastPath) return null;
  const folder =
    session.projectLastPath.replace(/\\/g, "/").split("/").filter(Boolean).at(-1)
    ?? session.projectLastPath;
  return {
    name: folder,
    path: shortProjectPath(session.projectLastPath),
    lastPath: session.projectLastPath,
  };
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
  const pinnedExpanded = useLayoutStore((s) => s.pinnedExpanded);
  const togglePinnedExpanded = useLayoutStore((s) => s.togglePinnedExpanded);
  const sessionSort = useLayoutStore((s) => s.sessionSort);
  const sessionGroupBy = useLayoutStore((s) => s.sessionGroupBy);
  const setSessionGroupBy = useLayoutStore((s) => s.setSessionGroupBy);

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
  const workbenchProjectIds = useWorkbenchStore((s) => s.workbenchProjectIds);
  const defaultProjectId = useWorkbenchStore((s) => s.defaultProjectId);
  const focusProjectId = useWorkbenchStore((s) => s.focusProjectId);
  const expandedWorkbenchProjectIds = useLayoutStore((s) => s.expandedWorkbenchProjectIds);
  const setExpandedWorkbenchProjectIds = useLayoutStore((s) => s.setExpandedWorkbenchProjectIds);
  const newSession = useChatStore((s) => s.newSession);
  const focusProject = useDocumentStore((s) => s.focusProject);
  const [missingProjectIds, setMissingProjectIds] = useState<Set<string>>(new Set());
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [customizeSidebarOpen, setCustomizeSidebarOpen] = useState(false);
  const leftNavHiddenIds = useSettingsStore((s) => s.settings.leftNavHiddenIds);
  const leftNavOrder = useSettingsStore((s) => s.settings.leftNavOrder);
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
    () =>
      resolvePrimaryNavItems(leftNavRegistry.getBySection("primary"), {
        hiddenIds: leftNavHiddenIds,
        order: leftNavOrder,
      }),
    [leftSidebarView, rightAreaExpanded, focusedMode, hasTexWorkspaceTab, leftNavHiddenIds, leftNavOrder],
  );
  const hubNavItems = useMemo(
    () => leftNavRegistry.getBySection("hub"),
    [leftSidebarView],
  );
  const footerNavItems = useMemo(
    () => leftNavRegistry.getBySection("footer"),
    [leftSidebarView, rightAreaExpanded, focusedMode, hasTexWorkspaceTab],
  );
  const settingsNavItem = footerNavItems.find((item) => item.id === "settings");
  const extraFooterNavItems = footerNavItems.filter((item) => item.id !== "settings");
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

  const updatedSessionGroups = useMemo(() => {
    const visible = sortedSessions.filter(
      (s) => !archivedSessionIds.includes(s.id) && !pinnedSessionIds.includes(s.id),
    );
    return groupSessionsByUpdatedAt(visible);
  }, [archivedSessionIds, pinnedSessionIds, sortedSessions]);

  const anyProjectExpanded = anyWorkbenchProjectExpanded(
    members.map((member) => member.id),
    expandedWorkbenchProjectIds,
    focusProjectId,
  );

  const expandOrCollapseAllProjects = useCallback(() => {
    setExpandedWorkbenchProjectIds(
      anyProjectExpanded ? [] : members.map((member) => member.id),
    );
  }, [anyProjectExpanded, members, setExpandedWorkbenchProjectIds]);

  const dateBucketLabel = (bucket: SessionDateBucket) => {
    if (bucket === "today") return t("nav.sessions.today");
    if (bucket === "yesterday") return t("nav.sessions.yesterday");
    if (bucket === "week") return t("nav.sessions.last7Days");
    if (bucket === "month") return t("nav.sessions.last30Days");
    return t("nav.sessions.older");
  };

  const pinnedSessions = useMemo(
    () =>
      sortedSessions.filter(
        (s) => pinnedSessionIds.includes(s.id) && !archivedSessionIds.includes(s.id),
      ),
    [archivedSessionIds, pinnedSessionIds, sortedSessions],
  );

  const archivedSessions = useMemo(
    () => sortedSessions.filter((s) => archivedSessionIds.includes(s.id)),
    [archivedSessionIds, sortedSessions],
  );

  const removeFromWorkbench = useCallback(async (projectId: string) => {
    const removed = members.find((member) => member.id === projectId);
    const next = await useWorkbenchStore.getState().removeProject(projectId);
    // Stay on the folder we just dropped from the list when it is still the
    // default role. Refocusing it would call project open and can remount the
    // trigger while the context menu is closing.
    if (
      removed
      && sameProjectPath(removed.lastPath, projectRoot)
      && next.defaultLastPath
      && !sameProjectPath(removed.lastPath, next.defaultLastPath)
    ) {
      await useDocumentStore.getState().focusProject(next.defaultLastPath);
    }
    void fetchSessionsRef.current({ silent: true });
  }, [members, projectRoot]);

  const archiveAllInProject = useCallback((lastPath: string, sessionIds: string[]) => {
    if (sessionIds.length === 0) return;
    void archiveSessionsForProject(lastPath, sessionIds);
  }, []);

  const toggleProjectExpanded = useCallback((projectId: string) => {
    setExpandedWorkbenchProjectIds(
      toggleWorkbenchProjectExpanded(projectId, expandedWorkbenchProjectIds, focusProjectId),
    );
  }, [expandedWorkbenchProjectIds, focusProjectId, setExpandedWorkbenchProjectIds]);

  const reorderProjects = useCallback((fromIndex: number, toIndex: number) => {
    const nextVisible = moveListItem(members.map((member) => member.id), fromIndex, toIndex);
    const fullIds = workbenchProjectIds.length >= nextVisible.length
      ? workbenchProjectIds
      : nextVisible;
    void useWorkbenchStore.getState().reorderProjects(
      applyVisibleIdReorder(fullIds, nextVisible),
    );
  }, [members, workbenchProjectIds]);

  const canReorderProjects = members.length > 1;
  const projectReorder = useVerticalListReorder(
    members.length,
    canReorderProjects,
    reorderProjects,
    { ignoreSelector: "[data-project-drag-ignore]" },
  );

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

  const renderSessionItem = (s: SessionInfo, opts?: { archivedRow?: boolean; showProject?: boolean }) => {
    const archivedRow = opts?.archivedRow ?? showArchived;
    const showProject = opts?.showProject === true;
    const project = showProject ? projectMetaForSession(s, members) : null;
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
    const sessionTrailing = (
      <>
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
          <span className="hidden group-hover/session:inline text-[length:var(--font-timestamp)] text-muted-foreground/70 shrink-0">
            {relativeTime(s.lastModified, t)}
          </span>
        )}
        {archivedRow ? (
          <>
            <Hint label={t("nav.sessions.restoreFromArchive")}>
              <span
                role="button"
                tabIndex={0}
                className="hidden group-hover/session:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
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
                className="hidden group-hover/session:block shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
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
              className="hidden group-hover/session:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
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
      </>
    );
    return (
      <SessionContextCard
        key={s.id}
        title={displayChatTitle(s.title, t)}
        sessionId={s.id}
        sessionDirectory={s.directory ?? s.projectLastPath}
        side="right"
        align="start"
      >
      <button
          type="button"
          data-workbench-session={s.id}
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
          className={cn(
            LEFT_SIDEBAR_ROW,
            LEFT_SIDEBAR_ROW_HOVER,
            "group/session",
            showProject && "items-start",
            isActive && LEFT_SIDEBAR_ROW_ACTIVE,
          )}
        >
          <span
            className={cn(
              "relative flex size-3.5 shrink-0 items-center justify-center",
              showProject && "h-[1lh] w-3.5",
            )}
          >
            {isWaitingPermission ? (
              <CircleAlert className="size-3.5 text-warning" strokeWidth={2.5} />
            ) : isSessionStreaming ? (
              <CircleDotDashed className="size-3.5 text-primary transition-opacity group-hover/session:opacity-0" strokeWidth={2.5} />
            ) : isAiTerminalRunning ? (
              <CircleDotDashed className="size-3.5 text-warning transition-opacity group-hover/session:opacity-0" strokeWidth={2.5} />
            ) : archivedRow ? (
              <Archive className="size-3.5 text-muted-foreground/70" />
            ) : isWorktreeSession ? (
              <WorkflowIcon className="size-3 text-primary/70 transition-opacity group-hover/session:opacity-0" strokeWidth={2} />
            ) : (
              <Dot className="size-3.5 text-muted-foreground/30 transition-opacity group-hover/session:opacity-0" strokeWidth={5.5} />
            )}
            {archivedRow ? null : (
            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/session:opacity-100">
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
                className="flex size-full items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
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
            )}
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={cn(showProject && "flex min-w-0 items-center gap-2")}>
              <span className={cn(showProject ? "min-w-0 flex-1 truncate" : "block truncate")}>
                {displayChatTitle(s.title, t)}
              </span>
              {showProject ? sessionTrailing : null}
            </span>
            {showProject && project ? (
              <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[length:var(--font-hint)] text-muted-foreground/70">
                <span className="min-w-0 truncate">{project.name}</span>
                {project.id === defaultProjectId ? <DefaultProjectBadge /> : null}
              </span>
            ) : null}
          </span>
          {showProject ? null : sessionTrailing}
        </button>
      </SessionContextCard>
    );
  };

  const renderArchivedSessionItem = (s: SessionInfo) => {
    const isActive = s.id === sessionId;
    const project = projectMetaForSession(s, members);
    return (
      <SessionContextCard
        key={s.id}
        title={displayChatTitle(s.title, t)}
        sessionId={s.id}
        sessionDirectory={s.directory ?? s.projectLastPath}
        side="right"
        align="start"
      >
      <button
        type="button"
        data-workbench-session={s.id}
        onClick={() => {
          loadSession(s.id, s.directory, s.projectLastPath);
          setLeftSidebarOverlay(false);
        }}
        className={cn(
          LEFT_SIDEBAR_ROW,
          LEFT_SIDEBAR_ROW_HOVER,
          "items-start group/session",
          isActive && LEFT_SIDEBAR_ROW_ACTIVE,
        )}
      >
        <span className="min-w-0 flex-1 text-left">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{displayChatTitle(s.title, t)}</span>
            <Hint label={t("nav.sessions.restoreFromArchive")}>
              <span
                role="button"
                tabIndex={0}
                className="hidden group-hover/session:block shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
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
                className="hidden group-hover/session:block shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
                onClick={async (e) => {
                  e.stopPropagation();
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
          </span>
          {project ? (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[length:var(--font-hint)] text-muted-foreground/70">
              <WorkbenchFolderGlyph />
              <span className="min-w-0 truncate">
                {project.path}
                {project.name !== project.path.split("/").at(-1) ? ` ${project.name}` : ""}
              </span>
            </span>
          ) : null}
        </span>
      </button>
      </SessionContextCard>
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
      <Sidebar collapsible="none" className="relative shrink-0 border-r-0" data-surface="sidebar" data-left-sidebar-slab="">
        <div className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center px-2 select-none">
          <SidebarHitChrome leftSidebarRef={leftSidebarRef!} />
        </div>
        <AppContextMenu>
          <AppContextMenuTrigger asChild>
            <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Fixed function buttons (do not scroll) ── */}
        <div className={cn("shrink-0 px-2", LEFT_SIDEBAR_STACK)}>
          <LeftNavButtonBar
            items={primaryNavItems.filter(isLeftNavRequired)}
            panelRefs={navPanelRefs}
            onPressed={dismissOverlay}
          />
          <LeftNavButtonBar
            items={hubNavItems}
            panelRefs={navPanelRefs}
            onPressed={dismissOverlay}
          />
          {primaryNavItems.some((item) => !isLeftNavRequired(item)) ? (
            <>
              <div role="separator" className="mx-2 my-1 h-px bg-border" />
              <LeftNavButtonBar
                items={primaryNavItems.filter((item) => !isLeftNavRequired(item))}
                panelRefs={navPanelRefs}
                onPressed={dismissOverlay}
              />
            </>
          ) : null}
        </div>

        {/* ── Scrollable workbench tree ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-1 pt-2">
          {!showArchived && pinnedSessions.length > 0 ? (
            <div className={LEFT_SIDEBAR_STACK}>
              <Hint label={pinnedExpanded ? t("nav.sessions.collapsePinned") : t("nav.sessions.expandPinned")}>
              <button
                type="button"
                className={cn(LEFT_SIDEBAR_SECTION_HEADER, "justify-start gap-1")}
                onClick={togglePinnedExpanded}
                aria-expanded={pinnedExpanded}
              >
                <span className={LEFT_SIDEBAR_SECTION_LABEL}>
                  {t("nav.sessions.pinned")}
                </span>
                <ChevronRight
                  className={cn(
                    LEFT_SIDEBAR_SECTION_ACTION_ICON,
                    "shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-out",
                    pinnedExpanded && "rotate-90",
                  )}
                />
              </button>
              </Hint>
              <LeftSidebarReveal open={pinnedExpanded}>
                {pinnedSessions.map((s) => renderSessionItem(s, { archivedRow: false }))}
              </LeftSidebarReveal>
            </div>
          ) : null}
          <div className={LEFT_SIDEBAR_SECTION_HEADER}>
            <span className={LEFT_SIDEBAR_SECTION_LABEL}>
              {showArchived ? t("nav.sessions.archived") : t("nav.workbench.title")}
            </span>
            <div className="flex items-center gap-1">
              <AppMenu>
                <Hint label={t("nav.sessions.filter")}>
                  <AppMenuTrigger asChild>
                    <button
                      type="button"
                      className={LEFT_SIDEBAR_SECTION_ACTION}
                    >
                      <ListFilter className={LEFT_SIDEBAR_SECTION_ACTION_ICON} />
                    </button>
                  </AppMenuTrigger>
                </Hint>
                <AppMenuContent
                  align="start"
                  collisionPadding={16}
                  className="min-w-[10.5rem] w-max max-w-[min(16rem,var(--radix-dropdown-menu-content-available-width))]"
                >
                  <AppMenuSub>
                    <AppMenuSubTrigger
                      trailing={
                        <span className="text-muted-foreground">
                          {sessionGroupBy === "updated"
                            ? t("nav.sessions.groupUpdated")
                            : t("nav.sessions.groupWorkbench")}
                        </span>
                      }
                    >
                      {t("nav.sessions.grouping")}
                    </AppMenuSubTrigger>
                    <AppMenuSubContent>
                      <AppMenuCheckItem
                        selected={sessionGroupBy === "workbench"}
                        leading={<Folder className="size-3.5 shrink-0 opacity-70" />}
                        onClick={() => setSessionGroupBy("workbench")}
                      >
                        {t("nav.sessions.groupWorkbench")}
                      </AppMenuCheckItem>
                      <AppMenuCheckItem
                        selected={sessionGroupBy === "updated"}
                        leading={<Clock className="size-3.5 shrink-0 opacity-70" />}
                        onClick={() => setSessionGroupBy("updated")}
                      >
                        {t("nav.sessions.groupUpdated")}
                      </AppMenuCheckItem>
                    </AppMenuSubContent>
                  </AppMenuSub>
                  <AppMenuSub>
                    <AppMenuSubTrigger>{t("nav.sessions.status")}</AppMenuSubTrigger>
                    <AppMenuSubContent>
                      <AppMenuItem disabled>{t("nav.sessions.statusSoon")}</AppMenuItem>
                    </AppMenuSubContent>
                  </AppMenuSub>
                  <AppMenuItem onClick={expandOrCollapseAllProjects}>
                    {anyProjectExpanded
                      ? t("nav.sessions.collapseAll")
                      : t("nav.sessions.expandAll")}
                  </AppMenuItem>
                </AppMenuContent>
              </AppMenu>
              {showArchived ? null : <WorkbenchAddMenu />}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : showArchived ? (
            archivedSessions.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4">
                <p className="text-center text-[length:var(--font-session-item)] leading-relaxed text-muted-foreground">
                  <Archive className="size-5 mx-auto mb-2 opacity-30" />
                  {t("nav.sessions.noArchived")}
                </p>
              </div>
            ) : (
              <div className={LEFT_SIDEBAR_STACK}>
                {archivedSessions.map(renderArchivedSessionItem)}
              </div>
            )
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
          ) : sessionGroupBy === "updated" ? (
            updatedSessionGroups.length === 0 && pinnedSessions.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4">
                <p className="text-center text-[length:var(--font-session-item)] leading-relaxed text-muted-foreground">
                  <MessageSquareIcon className="size-5 mx-auto mb-2 opacity-30" />
                  {t("nav.sessions.noSessions")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {updatedSessionGroups.map(({ bucket, sessions: groupSessions }, index) => (
                  <div
                    key={bucket}
                    className={cn(LEFT_SIDEBAR_STACK, index > 0 && LEFT_SIDEBAR_AFTER_EXPAND)}
                  >
                    <div className="px-2 pb-1 pt-1">
                      <span className={LEFT_SIDEBAR_SECTION_LABEL}>
                        {dateBucketLabel(bucket)}
                      </span>
                    </div>
                    {groupSessions.map((s) => renderSessionItem(s, { showProject: true }))}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div
              ref={projectReorder.listRef}
              className="relative flex flex-col"
              {...projectReorder.listProps}
            >
              {sessionGroups.map(({ member, sessions: groupSessions }, index) => {
              const missing = missingProjectIds.has(member.id);
              const expanded = isWorkbenchProjectExpanded(
                member.id,
                expandedWorkbenchProjectIds,
                focusProjectId,
              );
              const prevMember = index > 0 ? sessionGroups[index - 1]?.member : undefined;
              const afterExpanded = Boolean(
                prevMember &&
                  isWorkbenchProjectExpanded(
                    prevMember.id,
                    expandedWorkbenchProjectIds,
                    focusProjectId,
                  ),
              );
              const visible = groupSessions.filter((s) => !archivedSessionIds.includes(s.id));
              const activeSessionIds = groupSessions
                .filter((s) => !archivedSessionIds.includes(s.id))
                .map((s) => s.id);
              const item = projectReorder.itemProps(index);
              return (
                <div
                  key={member.id}
                  ref={item.ref}
                  className={cn(
                    LEFT_SIDEBAR_STACK,
                    index > 0 &&
                      (afterExpanded ? LEFT_SIDEBAR_AFTER_EXPAND : LEFT_SIDEBAR_AFTER_COLLAPSE),
                    projectReorder.draggingIndex === index && "opacity-50",
                  )}
                >
                  <div
                    className={cn(
                      LEFT_SIDEBAR_ROW,
                      LEFT_SIDEBAR_ROW_HOVER,
                      "group/project cursor-pointer select-none",
                      projectReorder.draggingIndex === index && "cursor-grabbing",
                    )}
                  >
                    <AppContextMenu>
                      <AppContextMenuTrigger asChild>
                        <button
                          type="button"
                          data-workbench-project={member.id}
                          className="flex min-w-0 flex-1 items-center gap-2 bg-transparent text-left"
                          {...item.dragHandleProps}
                          onClick={() => {
                            if (projectReorder.consumeSkipClick()) return;
                            toggleProjectExpanded(member.id);
                          }}
                        >
                          <WorkbenchFolderGlyph open={expanded} muted={missing} />
                          <span className="flex min-w-0 flex-1 items-center gap-1">
                            <span className="min-w-0 truncate font-medium">
                              {member.displayName}
                            </span>
                            {member.id === defaultProjectId ? <DefaultProjectBadge /> : null}
                          </span>
                          {missing ? (
                            <span className="truncate text-[length:var(--font-hint)] text-muted-foreground/70">
                              {t("nav.workbench.missingFolder")}
                            </span>
                          ) : null}
                        </button>
                      </AppContextMenuTrigger>
                      <AppContextMenuContent>
                        <AppContextMenuItem
                          leading={<Pencil className="size-3.5" />}
                          onSelect={() => setEditingProjectId(member.id)}
                        >
                          {t("nav.project.editProject")}
                        </AppContextMenuItem>
                        <AppContextMenuItem
                          leading={<Archive className="size-3.5" />}
                          disabled={activeSessionIds.length === 0}
                          onSelect={() => archiveAllInProject(member.lastPath, activeSessionIds)}
                        >
                          {t("nav.project.archiveAll")}
                        </AppContextMenuItem>
                        <AppContextMenuDestructiveItem
                          leading={<Trash2Icon className="size-3.5" />}
                          onSelect={() => {
                            window.setTimeout(() => {
                              void removeFromWorkbench(member.id);
                            }, 0);
                          }}
                        >
                          {t("nav.project.removeFromWorkbench")}
                        </AppContextMenuDestructiveItem>
                      </AppContextMenuContent>
                    </AppContextMenu>
                    {missing ? null : (
                      <Hint label={t("nav.workbench.newSessionInProject")}>
                        <span
                          role="button"
                          tabIndex={0}
                          data-project-drag-ignore
                          className={LEFT_SIDEBAR_ROW_ACTION}
                          onClick={(e) => {
                            e.stopPropagation();
                            void newSessionInProject(member.id, member.lastPath);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              void newSessionInProject(member.id, member.lastPath);
                            }
                          }}
                        >
                          <PlusIcon className="size-3" />
                        </span>
                      </Hint>
                    )}
                  </div>
                  <LeftSidebarReveal open={expanded}>
                    {missing ? (
                      <p className={cn(LEFT_SIDEBAR_ROW, "cursor-default text-muted-foreground/70")}>
                        <span className="min-w-0 flex-1 truncate text-left">
                          {t("nav.workbench.missingFolder")}
                        </span>
                      </p>
                    ) : visible.length === 0 ? (
                      <p className={cn(LEFT_SIDEBAR_ROW, "cursor-default text-muted-foreground/70")}>
                        <span className="min-w-0 flex-1 truncate text-left">
                          {t("nav.workbench.emptyProject")}
                        </span>
                      </p>
                    ) : (
                      visible.map((s) => renderSessionItem(s))
                    )}
                  </LeftSidebarReveal>
                </div>
              );
              })}
              {projectReorder.indicatorTop != null ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute right-2 left-2 z-10 h-0.5 rounded-full bg-primary"
                  style={{ top: projectReorder.indicatorTop }}
                />
              ) : null}
            </div>
          )}
        </div>
        <SidebarFooter className="px-2 pb-2 pt-1">
          <div className="flex items-center gap-1">
            {settingsNavItem ? (
              <LeftNavIconButton
                item={settingsNavItem}
                panelRefs={navPanelRefs}
                onPressed={dismissOverlay}
              />
            ) : null}
            <Hint label={t("nav.sessions.archived")} side="top">
              <button
                type="button"
                aria-label={t("nav.sessions.archived")}
                aria-pressed={showArchived}
                className={cn(
                  LEFT_SIDEBAR_FOOTER_ICON,
                  showArchived ? LEFT_SIDEBAR_ROW_ACTIVE : LEFT_SIDEBAR_ROW_HOVER,
                )}
                onClick={() => {
                  toggleShowArchived();
                  dismissOverlay();
                }}
              >
                <Archive
                  className={cn(
                    "size-3.5 shrink-0",
                    showArchived ? "text-primary" : "text-muted-foreground",
                  )}
                />
              </button>
            </Hint>
            {extraFooterNavItems.map((item) => (
              <LeftNavIconButton
                key={item.id}
                item={item}
                panelRefs={navPanelRefs}
                onPressed={dismissOverlay}
              />
            ))}
            <div className="ml-auto">
              <SidebarUpdateButton />
            </div>
          </div>
        </SidebarFooter>
            </div>
          </AppContextMenuTrigger>
          <AppContextMenuContent>
            <AppContextMenuItem
              leading={<SlidersHorizontal className="size-3.5" />}
              onSelect={() => setCustomizeSidebarOpen(true)}
            >
              {t("nav.customizeSidebar.menu")}
            </AppContextMenuItem>
          </AppContextMenuContent>
        </AppContextMenu>
      </Sidebar>
    </SidebarProvider>
  );

  return (
    <>
      {leftSidebarOverlay &&
        createPortal(
          <div className="fixed top-[var(--height-titlebar)] right-0 bottom-0 left-0 z-50 flex flex-col" data-surface="content" data-left-sidebar-overlay="">
            <div className="flex-1 min-h-0">{sidebarContent}</div>
          </div>,
          document.body,
        )}
      {sidebarContent}
      <CustomizeSidebarDialog
        open={customizeSidebarOpen}
        onOpenChange={setCustomizeSidebarOpen}
        panelRefs={navPanelRefs}
      />
      <EditProjectDialog
        projectId={editingProjectId}
        open={editingProjectId !== null}
        onOpenChange={(next) => {
          if (!next) setEditingProjectId(null);
        }}
      />
    </>
  );
});
