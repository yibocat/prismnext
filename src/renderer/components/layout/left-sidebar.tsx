import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
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
import { isRemoteProjectRoot } from "@shared/remote";
import {
  PinIcon,
  MessageSquareIcon,
  Loader2Icon,
  Archive,
  ArchiveRestore,
  Trash2Icon,
  ListFilter,
  Clock,
  Folder,
  ChevronRight,
  PlusIcon,
  Pencil,
  SlidersHorizontal,
  Download,
  CloudUpload,
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
  LEFT_SIDEBAR_SESSION_HOVER_ACTION,
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
} from "@/components/layout/left-nav-button";
import { SidebarUpdateButton } from "@/components/layout/sidebar-update-button";
import { SessionContextCard } from "@/components/layout/content-top-bar/session-context-card";
import {
  SessionContextMenu,
  SessionContextMenuTrigger,
  SessionTitleInline,
} from "@/components/layout/session-context-menu";
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
import { clearSessionChromeEntry } from "@/lib/chat/session-chrome";
import { SessionStatusIndicator } from "@/components/layout/session-status-indicator";
import { EditProjectDialog } from "@/components/modules/project/edit-project-dialog";
import {
  AppContextMenu,
  AppContextMenuContent,
  AppContextMenuDestructiveItem,
  AppContextMenuItem,
  AppContextMenuSeparator,
  AppContextMenuTrigger,
} from "@/components/ui/app-context-menu";
import {
  pushRemoteSkillsAction,
  setRemoteSyncModeAction,
  syncRemoteExperimentAction,
  syncRemoteFileAction,
  syncRemotePaperPdfAction,
  syncRemoteSessionsAction,
} from "@/lib/remote/sync-actions";
import { remoteHostDisplayName } from "@/lib/remote/display";
import { useRemoteStore } from "@/stores/remote-store";
import { useLiteratureStore } from "@/stores/literature-store";
import { useExperimentStore } from "@/stores/experiment-store";
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
  if (lastPath.startsWith("remote://")) {
    const abs = lastPath.replace(/^remote:\/\/[^/]+/, "");
    const parts = abs.split("/").filter(Boolean);
    return parts.slice(-2).join("/") || abs;
  }
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

function selectPendingQuestionSessionKey(state: {
  tabs: { id: string; sessionId: string | null; conversation: { pendingQuestion: unknown } }[];
}): string {
  const ids: string[] = [];
  for (const t of state.tabs) {
    if (!t.conversation.pendingQuestion) continue;
    ids.push(t.sessionId || t.id);
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

export const LeftSidebar = memo(function LeftSidebar() {
  const { t } = useTranslation();

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
  const pendingQuestionSessionKey = useChatStore(selectPendingQuestionSessionKey);
  const pendingQuestionSessionIds = useMemo(
    () => new Set(pendingQuestionSessionKey ? pendingQuestionSessionKey.split("\0") : []),
    [pendingQuestionSessionKey],
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
  const pendingPermissions = usePermissionStore((s) => s.permissions);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const remoteHosts = useRemoteStore((s) => s.hosts);
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
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const leftNavHiddenIds = useSettingsStore((s) => s.settings.leftNavHiddenIds);
  const leftNavOrder = useSettingsStore((s) => s.settings.leftNavOrder);
  const sessionChromeByProject = useSettingsStore((s) => s.settings.sessionChromeByProject);
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
    void clearSessionChromeEntry(root, sessionId);
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
          if (isRemoteProjectRoot(member.lastPath)) return [member.id, true] as const;
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
  }, [
    expandedWorkbenchProjectIds,
    focusProject,
    focusProjectId,
    newSession,
    setExpandedWorkbenchProjectIds,
  ]);

  const renderSessionItem = (s: SessionInfo, opts?: { archivedRow?: boolean; showProject?: boolean }) => {
    const archivedRow = opts?.archivedRow ?? showArchived;
    const showProject = opts?.showProject === true;
    const project = showProject ? projectMetaForSession(s, members) : null;
    const isActive = s.id === sessionId;
    const isSessionStreaming = streamingSessionIds.has(s.id);
    const isAiTerminalRunning = aiTerminalRunningSessionIds.has(s.id);
    const isWaitingPermission =
      hasPendingPermission(pendingPermissions, s.id)
      || pendingQuestionSessionIds.has(s.id);
    const checkoutContext = resolveSessionWorktreeContext(
      s.directory,
      s.projectLastPath || projectRoot,
      worktrees,
    );
    const isWorktreeSession = checkoutContext.kind !== "local";
    const sessionProjectRoot = s.projectLastPath || projectRoot;
    const chromeEntry = sessionProjectRoot
      ? sessionChromeByProject?.[sessionProjectRoot]?.[s.id]
      : undefined;
    const isPinned = pinnedSessionIds.includes(s.id);
    const sessionTrailing = (
      <span className="flex shrink-0 items-center gap-1">
        {archivedRow ? null : (
          <Hint
            label={isPinned ? t("nav.sessions.unpin") : t("nav.sessions.pin")}
            triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
          >
            <span
              role="button"
              tabIndex={0}
              className="shrink-0 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); pinSession(s.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); pinSession(s.id); } }}
            >
              <PinIcon
                className={cn("size-3.5", isPinned && "fill-current")}
                strokeWidth={isPinned ? 2 : 1.75}
              />
            </span>
          </Hint>
        )}
        {archivedRow ? (
          <>
            <Hint
              label={t("nav.sessions.restoreFromArchive")}
              triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
            >
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); archiveSession(s.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); archiveSession(s.id); } }}
              >
                <ArchiveRestore className="size-3.5" />
              </span>
            </Hint>
            <Hint
              label={t("nav.sessions.delete")}
              triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
            >
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
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
                <Trash2Icon className="size-3.5" />
              </span>
            </Hint>
          </>
        ) : (
          <Hint
            label={t("nav.sessions.archive")}
            triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
          >
            <span
              role="button"
              tabIndex={0}
              className="shrink-0 cursor-pointer"
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
              <Archive className="size-3.5" />
            </span>
          </Hint>
        )}
        <span
          className={cn(
            LEFT_SIDEBAR_SESSION_HOVER_ACTION,
            "text-[length:var(--font-size-12)] text-muted-foreground/70 tabular-nums",
          )}
        >
          {relativeTime(s.lastModified, t)}
        </span>
      </span>
    );
    const title = displayChatTitle(s.title, t);
    const isRenaming = renamingSessionId === s.id;
    const rowButton = (
      <button
          type="button"
          data-workbench-session={s.id}
          onClick={() => {
            if (isRenaming) return;
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
              "relative flex size-4 shrink-0 items-center justify-center",
              showProject && "h-[1lh] w-4",
            )}
          >
            <SessionStatusIndicator
              archivedRow={archivedRow}
              isActive={isActive}
              isWaitingPermission={isWaitingPermission}
              isStreaming={isSessionStreaming}
              isAiTerminalRunning={isAiTerminalRunning}
              isUnread={chromeEntry?.unread === true}
              customIcon={chromeEntry?.icon ?? null}
              implicitWorktree={isWorktreeSession}
            />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className={cn(showProject && "flex min-w-0 items-center gap-2")}>
              <SessionTitleInline
                title={title}
                editing={isRenaming}
                sessionId={s.id}
                className={cn(
                  showProject ? "min-w-0 flex-1 truncate" : "block truncate",
                  chromeEntry?.unread === true && !isActive && "font-medium",
                )}
                onCancel={() => setRenamingSessionId(null)}
              />
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
    );
    const trigger = (
      <SessionContextMenuTrigger asChild>{rowButton}</SessionContextMenuTrigger>
    );
    return (
      <SessionContextMenu
        key={s.id}
        sessionId={s.id}
        title={title}
        projectRoot={sessionProjectRoot}
        sessionDirectory={s.directory ?? s.projectLastPath}
        pinned={pinnedSessionIds.includes(s.id)}
        archived={archivedRow}
        unread={chromeEntry?.unread === true}
        onRequestRename={() => setRenamingSessionId(s.id)}
        onAfterArchive={() => {
          if (!archivedRow && s.id === sessionId) clearCurrentTab();
        }}
      >
        {isRenaming ? trigger : (
          <SessionContextCard
            title={title}
            sessionId={s.id}
            sessionDirectory={s.directory ?? s.projectLastPath}
            projectLastPath={s.projectLastPath}
            side="right"
            align="start"
          >
            {trigger}
          </SessionContextCard>
        )}
      </SessionContextMenu>
    );
  };

  const renderArchivedSessionItem = (s: SessionInfo) => {
    const isActive = s.id === sessionId;
    const project = projectMetaForSession(s, members);
    const sessionProjectRoot = s.projectLastPath || projectRoot;
    const chromeEntry = sessionProjectRoot
      ? sessionChromeByProject?.[sessionProjectRoot]?.[s.id]
      : undefined;
    const title = displayChatTitle(s.title, t);
    const isRenaming = renamingSessionId === s.id;
    const rowButton = (
      <button
        type="button"
        data-workbench-session={s.id}
        onClick={() => {
          if (isRenaming) return;
          loadSession(s.id, s.directory, s.projectLastPath);
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
            <SessionTitleInline
              title={title}
              editing={isRenaming}
              sessionId={s.id}
              className={cn(
                "min-w-0 flex-1 truncate",
                chromeEntry?.unread === true && !isActive && "font-medium",
              )}
              onCancel={() => setRenamingSessionId(null)}
            />
            <Hint
              label={t("nav.sessions.restoreFromArchive")}
              triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
            >
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => { e.stopPropagation(); archiveSession(s.id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); archiveSession(s.id); } }}
              >
                <ArchiveRestore className="size-3.5" />
              </span>
            </Hint>
            <Hint
              label={t("nav.sessions.delete")}
              triggerClassName={LEFT_SIDEBAR_SESSION_HOVER_ACTION}
            >
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 text-muted-foreground hover:text-destructive cursor-pointer"
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
                <Trash2Icon className="size-3.5" />
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
    );
    const trigger = (
      <SessionContextMenuTrigger asChild>{rowButton}</SessionContextMenuTrigger>
    );
    return (
      <SessionContextMenu
        key={s.id}
        sessionId={s.id}
        title={title}
        projectRoot={sessionProjectRoot}
        sessionDirectory={s.directory ?? s.projectLastPath}
        pinned={false}
        archived
        unread={chromeEntry?.unread === true}
        onRequestRename={() => setRenamingSessionId(s.id)}
      >
        {isRenaming ? trigger : (
          <SessionContextCard
            title={title}
            sessionId={s.id}
            sessionDirectory={s.directory ?? s.projectLastPath}
            projectLastPath={s.projectLastPath}
            side="right"
            align="start"
          >
            {trigger}
          </SessionContextCard>
        )}
      </SessionContextMenu>
    );
  };

  if (leftSidebarView === "settings") {
    return (
      <SettingsSidebar
        activeCategory={settingsCategory as SettingsCategory}
        onSelectCategory={(id) => { setSettingsCategory(id); }}
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
          <SidebarHitChrome />
        </div>
        <AppContextMenu>
          <AppContextMenuTrigger asChild>
            <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Fixed function buttons (do not scroll) ── */}
        <div className={cn("shrink-0 px-2", LEFT_SIDEBAR_STACK)}>
          <LeftNavButtonBar
            items={primaryNavItems.filter(isLeftNavRequired)}
          />
          <LeftNavButtonBar
            items={hubNavItems}
          />
          {primaryNavItems.some((item) => !isLeftNavRequired(item)) ? (
            <>
              <div role="separator" className="mx-2 my-1 h-px bg-border" />
              <LeftNavButtonBar
                items={primaryNavItems.filter((item) => !isLeftNavRequired(item))}
              />
            </>
          ) : null}
        </div>

        {/* ── Scrollable workbench tree ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto px-2 pb-1 pt-2">
          {!showArchived && pinnedSessions.length > 0 ? (
            <div className={LEFT_SIDEBAR_STACK}>
              <Hint
                label={pinnedExpanded ? t("nav.sessions.collapsePinned") : t("nav.sessions.expandPinned")}
                triggerClassName="w-full justify-start"
              >
              <button
                type="button"
                className={cn(LEFT_SIDEBAR_SECTION_HEADER, "w-full justify-start gap-1")}
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
              const hostLabel = remoteHostDisplayName(member.lastPath, remoteHosts);
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
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="min-w-0 truncate font-medium">
                              {member.displayName}
                            </span>
                            {hostLabel ? (
                              <span className="min-w-0 truncate text-[length:var(--font-hint)] text-muted-foreground/45">
                                {hostLabel}
                              </span>
                            ) : null}
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
                        {member.lastPath.startsWith("remote://") ? (
                          <>
                            <AppContextMenuSeparator />
                            <AppContextMenuItem
                              leading={<Download className="size-3.5" />}
                              onSelect={() => {
                                void syncRemoteSessionsAction(member);
                                const fileId = useDocumentStore.getState().activeFileId;
                                const file = fileId
                                  ? useDocumentStore.getState().fileMetadata.get(fileId)
                                  : null;
                                if (file?.absolutePath.startsWith("remote://")) {
                                  void syncRemoteFileAction(member, file.absolutePath);
                                }
                                const paperId = useLiteratureStore.getState().selectedPaperId;
                                if (paperId) void syncRemotePaperPdfAction(member, paperId);
                                const experimentId = useExperimentStore.getState().selectedId;
                                if (experimentId) void syncRemoteExperimentAction(member, experimentId);
                              }}
                            >
                              {t("remote.sync.toThisComputer")}
                            </AppContextMenuItem>
                            <AppContextMenuItem
                              leading={<CloudUpload className="size-3.5" />}
                              onSelect={() => void pushRemoteSkillsAction(member.lastPath)}
                            >
                              {t("remote.sync.pushSkills")}
                            </AppContextMenuItem>
                            <AppContextMenuItem
                              onSelect={() => void setRemoteSyncModeAction(member.lastPath, "on-demand")}
                            >
                              {t("remote.sync.modeOnDemand")}
                            </AppContextMenuItem>
                            <AppContextMenuItem
                              onSelect={() => void setRemoteSyncModeAction(member.lastPath, "online-only")}
                            >
                              {t("remote.sync.modeOnlineOnly")}
                            </AppContextMenuItem>
                          </>
                        ) : null}
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
      {sidebarContent}
      <CustomizeSidebarDialog
        open={customizeSidebarOpen}
        onOpenChange={setCustomizeSidebarOpen}
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
