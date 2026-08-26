import { clearPdfCache } from "@/stores/compile-store";
import { useChangesStore } from "@/stores/changes-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useGitStore } from "@/stores/git-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectDialogStore } from "@/stores/project-dialog-store";
import { useProjectStore } from "@/stores/project-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import {
  defaultProjectAsMember,
  ensureWorkbenchProjectExpanded,
  resolveWorkbenchMember,
  resolveWorkbenchMemberByPath,
  sameProjectPath,
  useWorkbenchStore,
} from "@/stores/workbench-store";
import { settingsDesktop } from "@/lib/desktop-api/settings";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { loadWorkbenchSessionUiPrefs } from "@/lib/chat/session-ui-prefs";
import { agentDesktop } from "@/lib/desktop-api/agent";
import { dialogDesktop } from "@/lib/desktop-api/dialog";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { remoteDesktop } from "@/lib/desktop-api/remote";
import { gitDesktop } from "@/lib/desktop-api/git";
import { projectDesktop } from "@/lib/desktop-api/project";
import { executionDesktop } from "@/lib/desktop-api/execution";
import { getProjectLastActiveFileId } from "@/lib/files/recent-files";
import { i18n } from "@/lib/i18n";
import { createLogger } from "@/services/logger";
import { terminalExecutionIsFinal, type TerminalExecutionSummary } from "../../../shared/execution";
import { isRemoteProjectRoot, recoverRemoteAbs } from "../../../shared/remote";

const log = createLogger("project-lifecycle");

export type ProjectSwitchDecision = "continue" | "stop" | "abort";

export function listRunningExperimentIds(projectId: string): string[] {
  const key = (projectId || "").trim();
  if (!key) return [];
  return Object.values(useExecutionStore.getState().byId)
    .map((view) => view.summary)
    .filter((summary): summary is TerminalExecutionSummary =>
      Boolean(
        summary
        && summary.projectId === key
        && summary.origin === "experiment-run"
        && !terminalExecutionIsFinal(summary.state),
      ),
    )
    .map((summary) => summary.executionId);
}

export async function confirmProjectSwitchIfNeeded(
  previousProjectId: string | null | undefined,
): Promise<ProjectSwitchDecision> {
  const projectId = (previousProjectId || "").trim();
  if (!projectId) return "continue";

  let runningIds = listRunningExperimentIds(projectId);
  try {
    const listed = await executionDesktop.executionListRunning();
    if (listed?.ok) {
      runningIds = listed.summaries
        .filter((summary) =>
          summary.origin === "experiment-run" && !terminalExecutionIsFinal(summary.state),
        )
        .map((summary) => summary.executionId);
    }
  } catch {
    // Renderer store is enough when main is unavailable (tests).
  }
  if (runningIds.length === 0) return "continue";

  return new Promise((resolve) => {
    useTabCloseConfirmStore.getState().open({
      tabId: "project-switch",
      title: i18n.t("dialogs.projectSwitch.title"),
      description: i18n.t("dialogs.projectSwitch.description"),
      detail: i18n.t("dialogs.projectSwitch.detail"),
      confirmLabel: i18n.t("dialogs.projectSwitch.continue"),
      secondaryLabel: i18n.t("dialogs.projectSwitch.stop"),
      onConfirm: () => resolve("continue"),
      onSecondary: () => resolve("stop"),
      onDismiss: () => resolve("abort"),
    });
  });
}

/**
 * Refresh the focused project's file/research UI without killing other
 * conversations, permissions, or background experiments (P4 / D-5 / D-6).
 */
export async function applyWorkbenchFocusChange(): Promise<void> {
  useRightPanelStore.getState().closeAllTabs({ force: true });
  clearPdfCache();
  useChangesStore.getState().clearAll();
  useWorktreeStore.getState().clearAll();
  useGitStore.getState().clearAll();
  useWorkspaceConfigStore.getState().reset();
  useExperimentStore.getState().reset();
}

export type WorkbenchFocusScan = {
  files: Array<{
    relativePath: string;
    absolutePath: string;
    type: string;
    fileSize?: number;
  }>;
  folders: string[];
};

/**
 * Single focus-switch orchestration: reset RightArea / git / experiments, then
 * activate the new root and refresh neighbors. Does not dispose other
 * conversations (P4 / D-5). document-store only writes the file tree via
 * `applyDocumentTree`.
 */
export async function switchWorkbenchFocus(opts: {
  canonicalRoot: string;
  shouldAbort: () => boolean;
  supersededByClose: () => boolean;
  applyDocumentTree: (scan: WorkbenchFocusScan) => void;
}): Promise<void> {
  const { canonicalRoot, shouldAbort, supersededByClose, applyDocumentTree } = opts;

  await applyWorkbenchFocusChange();
  if (shouldAbort()) return;

  projectDesktop.projectEnsure(canonicalRoot).catch(() => {});
  void import("@/stores/command-store").then(({ useCommandStore }) => {
    useCommandStore.getState().reloadCommands();
  });

  const result = await fsDesktop.fsScanMetadata(canonicalRoot);
  if (shouldAbort()) return;

  if (!isRemoteProjectRoot(canonicalRoot)) {
    gitDesktop.gitWarmup(canonicalRoot).catch(() => {});
  }
  await useWorkspaceConfigStore.getState().loadConfig(canonicalRoot);
  if (shouldAbort()) return;

  if (!isRemoteProjectRoot(canonicalRoot)) {
    void import("@/stores/literature-store").then(({ useLiteratureStore }) => {
      if (shouldAbort()) return;
      void useLiteratureStore.getState().refresh(canonicalRoot);
    });
  }

  const lastActiveFileId = getProjectLastActiveFileId(canonicalRoot);
  const expandedFolders = (() => {
    if (!lastActiveFileId) return [] as string[];
    const parts = lastActiveFileId.split("/");
    const ancestors: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      ancestors.push(parts.slice(0, i).join("/"));
    }
    return ancestors.filter((folder) => result.folders.includes(folder));
  })();

  void import("@/stores/git-store").then(({ useGitStore }) => {
    useGitStore.getState().clearAll();
    useGitStore.getState().selectUnit(canonicalRoot);
  });

  if (shouldAbort()) return;
  await projectDesktop.projectActivate(canonicalRoot);
  if (shouldAbort()) {
    if (supersededByClose()) {
      try {
        await projectDesktop.projectClose();
      } catch (revertError) {
        log.warn("project.activate", { error: String(revertError), reason: "revoke_superseded" });
      }
    }
    return;
  }

  useProjectStore.getState().addRecentProject(canonicalRoot);
  applyDocumentTree({
    files: result.files,
    folders: result.folders,
  });

  const wb = useWorkbenchStore.getState();
  const member = wb.members.find((item) => sameProjectPath(item.lastPath, canonicalRoot));
  if (member) wb.setFocusProject(member.id);
  loadWorkbenchSessionUiPrefs(wb.members.map((item) => item.lastPath));
  useLayoutStore.getState().setExpandedFileTreeFolders(expandedFolders);
}

export type WorkbenchResumeSnapshot = {
  lastFocusProjectId: string;
  lastFocusConversationId: string;
  lastOpenConversationIds: string[];
  lastSessionProjectIds: Record<string, string>;
};

export type WorkbenchLaunchTarget = {
  projectId: string;
  projectPath: string;
  conversationId: string | null;
  openConversationIds: string[];
};

export function resolveWorkbenchLaunchTarget(
  state: {
    defaultProjectId: string;
    defaultLastPath: string;
    members: Array<{ id: string; lastPath: string; displayName: string }>;
  },
  resume?: Partial<WorkbenchResumeSnapshot> | null,
): WorkbenchLaunchTarget {
  const requested = resume?.lastFocusProjectId?.trim() ?? "";
  const focused =
    (requested ? resolveWorkbenchMember(state, requested) : null)
    ?? defaultProjectAsMember(state);
  const conversationId = resume?.lastFocusConversationId?.trim() || null;
  const open = (resume?.lastOpenConversationIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  const openConversationIds = conversationId && !open.includes(conversationId)
    ? [...open, conversationId]
    : open;
  return {
    projectId: focused?.id ?? "",
    projectPath: focused?.lastPath ?? "",
    conversationId,
    openConversationIds,
  };
}

export function readWorkbenchResume(): WorkbenchResumeSnapshot {
  const settings = useSettingsStore.getState().settings;
  return {
    lastFocusProjectId: settings.lastFocusProjectId?.trim() ?? "",
    lastFocusConversationId: settings.lastFocusConversationId?.trim() ?? "",
    lastOpenConversationIds: [...(settings.lastOpenConversationIds ?? [])],
    lastSessionProjectIds: { ...(settings.lastSessionProjectIds ?? {}) },
  };
}

export async function writeWorkbenchResume(snapshot: WorkbenchResumeSnapshot): Promise<void> {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, ...snapshot },
  }));
  await settingsDesktop.settingsSet(snapshot);
}

export function snapshotWorkbenchResume(): WorkbenchResumeSnapshot {
  const wb = useWorkbenchStore.getState();
  const chat = useChatStore.getState();
  const mapped = chat.activeTabId ? wb.sessionProjectIds[chat.activeTabId] : "";
  return {
    lastFocusProjectId: mapped || wb.focusProjectId || "",
    lastFocusConversationId: chat.activeTabId || wb.focusConversationId || "",
    lastOpenConversationIds: chat.tabs.map((tab) => tab.id),
    lastSessionProjectIds: { ...wb.sessionProjectIds },
  };
}

let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let resumeUnsubs: Array<() => void> = [];

export function rememberWorkbenchResume(): void {
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    resumeTimer = null;
    void writeWorkbenchResume(snapshotWorkbenchResume());
  }, 250);
}

export function watchWorkbenchResume(): void {
  if (resumeUnsubs.length > 0) return;
  resumeUnsubs.push(useWorkbenchStore.subscribe(() => rememberWorkbenchResume()));
  resumeUnsubs.push(useChatStore.subscribe(() => rememberWorkbenchResume()));
}

export function stopWatchingWorkbenchResume(): void {
  if (resumeTimer) {
    clearTimeout(resumeTimer);
    resumeTimer = null;
  }
  for (const unsub of resumeUnsubs) unsub();
  resumeUnsubs = [];
}

export async function restoreWorkbenchLaunch(opts?: { watch?: boolean }): Promise<void> {
  try {
    const state = await useWorkbenchStore.getState().hydrate();
    const resume = readWorkbenchResume();
    const target = resolveWorkbenchLaunchTarget(state, resume);
    if (Object.keys(resume.lastSessionProjectIds).length > 0) {
      useWorkbenchStore.getState().recordSessionProjects(resume.lastSessionProjectIds);
    }

    const { useDocumentStore } = await import("@/stores/document-store");
    if (!useDocumentStore.getState().projectRoot && target.projectPath) {
      const remote = recoverRemoteAbs(target.projectPath);
      const onWorkbench = state.members.some((member) => member.id === target.projectId);
      if (remote) await useDocumentStore.getState().focusProject(remote);
      else if (onWorkbench) await useDocumentStore.getState().openProject(target.projectPath);
      else await useDocumentStore.getState().focusProject(target.projectPath);
    }

    const projectIds = new Set<string>();
    if (target.projectId) projectIds.add(target.projectId);
    for (const conversationId of target.openConversationIds) {
      const mapped = resume.lastSessionProjectIds[conversationId];
      if (mapped) projectIds.add(mapped);
    }
    const existing = new Set<string>();
    for (const projectId of projectIds) {
      const rows = await agentDesktop.agentListSessionsByProjectId(projectId) ?? [];
      for (const row of rows) {
        if (row?.conversationId) existing.add(row.conversationId);
      }
    }

    const wb = useWorkbenchStore.getState();
    const pathFor = (conversationId: string): string => {
      const projectId = resume.lastSessionProjectIds[conversationId] || target.projectId;
      return resolveWorkbenchMember(wb, projectId)?.lastPath || target.projectPath;
    };
    const toLoad = target.openConversationIds.filter((id) => existing.has(id));
    const active = target.conversationId && existing.has(target.conversationId)
      ? target.conversationId
      : null;
    for (const id of toLoad.filter((id) => id !== active)) {
      const path = pathFor(id);
      if (path) await useChatStore.getState().loadSession(id, undefined, path);
    }
    if (active) {
      const path = pathFor(active);
      if (path) await useChatStore.getState().loadSession(active, undefined, path);
    } else if (target.projectId) {
      const tabId = useChatStore.getState().activeTabId;
      if (tabId) useWorkbenchStore.getState().recordSessionProject(tabId, target.projectId);
    }
    await writeWorkbenchResume(snapshotWorkbenchResume());
  } finally {
    if (opts?.watch !== false) watchWorkbenchResume();
  }
}

/** Recents shown in the Workbench add panel before the user clicks More. */
export const JOINABLE_RECENT_PREVIEW_COUNT = 8;

export type JoinableRecentProject = {
  path: string;
  name: string;
  lastOpened: number;
};

export type RecentWorkbenchProject = JoinableRecentProject & {
  onWorkbench: boolean;
  isDefault?: boolean;
};

/** Recents matching `query` (name or full path). Workbench members stay listed. */
export function filterRecentWorkbenchProjects(
  recents: ReadonlyArray<JoinableRecentProject>,
  memberPaths: ReadonlyArray<string>,
  query: string,
  defaultProject?: { path: string; name: string } | null,
): RecentWorkbenchProject[] {
  const q = query.trim().toLowerCase();
  const list = [...recents];
  if (
    defaultProject?.path.trim()
    && !isRemoteProjectRoot(defaultProject.path)
    && !list.some((item) => sameProjectPath(item.path, defaultProject.path))
  ) {
    list.unshift({
      path: defaultProject.path,
      name: defaultProject.name,
      lastOpened: Number.MAX_SAFE_INTEGER,
    });
  }
  return list
    .filter((item) => {
      if (isRemoteProjectRoot(item.path)) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q);
    })
    .map((item) => ({
      ...item,
      onWorkbench: memberPaths.some((memberPath) => sameProjectPath(memberPath, item.path)),
      ...(defaultProject && sameProjectPath(item.path, defaultProject.path)
        ? { isDefault: true }
        : {}),
    }));
}

export function visibleJoinableRecentProjects(
  filtered: ReadonlyArray<RecentWorkbenchProject>,
  opts: { expanded: boolean; previewCount?: number },
): { items: RecentWorkbenchProject[]; remaining: number } {
  const previewCount = opts.previewCount ?? JOINABLE_RECENT_PREVIEW_COUNT;
  if (opts.expanded || filtered.length <= previewCount) {
    return { items: [...filtered], remaining: 0 };
  }
  return {
    items: filtered.slice(0, previewCount),
    remaining: filtered.length - previewCount,
  };
}

/** Prompt to scaffold `.workbench/` when the folder is not a project yet. */
export async function confirmProjectScaffold(path: string): Promise<boolean> {
  const check = await projectDesktop.projectCheck(path);
  if (check.missing.length > 0) {
    const result = await useProjectDialogStore.getState().show(path, check.missing);
    if (result === "cancel") return false;
    if (result === "create") {
      await projectDesktop.projectCreate(path);
    }
  }
  return true;
}

/** Open a folder onto the workbench (reuse id when `.workbench/workbench.json` exists). */
export async function joinWorkbenchFolder(path: string): Promise<boolean> {
  const ok = await confirmProjectScaffold(path);
  if (!ok) return false;
  const { useDocumentStore } = await import("@/stores/document-store");
  await useDocumentStore.getState().openProject(path);
  return true;
}

export async function openRemoteWorkbenchProject(
  profileId: string,
  remoteRoot: string,
): Promise<boolean> {
  const opened = await remoteDesktop.remoteOpenProject({ profileId, remoteRoot });
  await useWorkbenchStore.getState().hydrate();
  const { useDocumentStore } = await import("@/stores/document-store");
  await useDocumentStore.getState().focusProject(opened.lastPath);
  return true;
}

export async function pickAndJoinWorkbenchFolder(): Promise<boolean> {
  const result = await dialogDesktop.dialogOpenFolder();
  if (result.canceled || !result.path) return false;
  return joinWorkbenchFolder(result.path);
}

/**
 * Bind the open chat to another workbench project. Empty tabs only update
 * the renderer mapping (first send writes the record). Persisted sessions
 * move on disk and drop their live runtime so the next send opens the new root.
 */
export async function assignSessionProject(
  conversationId: string,
  projectId: string,
): Promise<boolean> {
  const id = conversationId.trim();
  const nextId = projectId.trim();
  if (!id || !nextId) return false;

  const wb = useWorkbenchStore.getState();
  const member = resolveWorkbenchMember(wb, nextId);
  if (!member?.lastPath.trim()) return false;

  const { useChatStore } = await import("@/stores/chat-store");
  const tab = useChatStore.getState().tabs.find((item) => item.id === id);
  if (tab?.isStreaming) return false;
  const conversation = tab?.conversation;
  if (conversation && (conversation.turns.length > 0 || conversation.live)) return false;

  const alreadyMapped = wb.sessionProjectIds[id] === nextId;
  if (!alreadyMapped) {
    const result = await agentDesktop.agentReassignSessionProject({
      conversationId: id,
      projectId: nextId,
      projectRoot: member.lastPath,
    });
    if (!result?.ok) return false;
    useWorkbenchStore.getState().recordSessionProject(id, nextId);
  }

  const layout = useLayoutStore.getState();
  layout.setExpandedWorkbenchProjectIds(
    ensureWorkbenchProjectExpanded(
      nextId,
      layout.expandedWorkbenchProjectIds,
      useWorkbenchStore.getState().focusProjectId,
    ),
  );

  useChatStore.getState()._setSessionCwd(id, member.lastPath);

  const { applyCheckoutTransition } = await import("@/lib/git/checkout-context");
  const { useDocumentStore } = await import("@/stores/document-store");
  await useDocumentStore.getState().focusProject(member.lastPath);
  await applyCheckoutTransition({ type: "local" });

  const { refreshAgentSessionList } = await import("@/stores/chat/model");
  refreshAgentSessionList();
  return true;
}

/**
 * Bind an empty chat to a folder. Known members and the off-list default
 * assign in place. Other folders join the workbench first — this does not
 * open a new chat the way the sidebar + panel does.
 */
export async function assignSessionToProjectPath(
  conversationId: string,
  path: string,
): Promise<boolean> {
  const folder = path.trim();
  if (!conversationId.trim() || !folder) return false;

  let member = resolveWorkbenchMemberByPath(useWorkbenchStore.getState(), folder);
  if (!member) {
    const joined = await joinWorkbenchFolder(folder);
    if (!joined) return false;
    member = resolveWorkbenchMemberByPath(useWorkbenchStore.getState(), folder);
  }
  if (!member) return false;
  return assignSessionProject(conversationId, member.id);
}

export async function pickFolderAndAssignSession(conversationId: string): Promise<boolean> {
  const result = await dialogDesktop.dialogOpenFolder();
  if (result.canceled || !result.path) return false;
  return assignSessionToProjectPath(conversationId, result.path);
}

/**
 * Recents click: workbench members switch focus and open a new chat;
 * other folders join the workbench.
 */
export async function openRecentFromAddPanel(path: string): Promise<boolean> {
  const wb = useWorkbenchStore.getState();
  const member = wb.members.find((item) => sameProjectPath(item.lastPath, path));
  if (!member) return joinWorkbenchFolder(path);

  const layout = useLayoutStore.getState();
  layout.setExpandedWorkbenchProjectIds(
    ensureWorkbenchProjectExpanded(
      member.id,
      layout.expandedWorkbenchProjectIds,
      wb.focusProjectId,
    ),
  );
  const { useDocumentStore } = await import("@/stores/document-store");
  await useDocumentStore.getState().focusProject(member.lastPath);
  const { useChatStore } = await import("@/stores/chat-store");
  useChatStore.getState().newSession();
  return true;
}
