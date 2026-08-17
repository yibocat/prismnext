import { clearPdfCache } from "@/stores/compile-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useGitStore } from "@/stores/git-store";
import { useLayoutStore } from "@/stores/layout-store";
import { usePermissionStore } from "@/stores/permission-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { i18n } from "@/lib/i18n";
import { terminalExecutionIsFinal, type TerminalExecutionSummary } from "../../../shared/execution";

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
    const listed = await window.electronAPI.executionListRunning?.();
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
 * Tear down in-memory state that must not leak across projects.
 * Called at the start of openProject and from closeProject.
 * @param keepProjectPath When reopening the same project, keep its OpenCode runtime.
 */
export async function resetApplicationStateForProjectSwitch(
  keepProjectPath?: string | null,
  options?: { previousProjectId?: string | null; stopExperimentIds?: string[] },
): Promise<void> {
  await window.electronAPI.agentDispose();
  const previousProjectId = (options?.previousProjectId || "").trim();
  if (previousProjectId) {
    await window.electronAPI.executionApplyProjectSwitch?.({
      projectId: previousProjectId,
      stopExperimentIds: options?.stopExperimentIds,
    });
  }

  useRightPanelStore.getState().closeAllTabs({ force: true });
  useChatStore.getState().clearAllSessions();

  useLayoutStore.getState().setLeftSidebarView("sessions");
  useLayoutStore.getState().setLeftSidebarOverlay(false);
  useLayoutStore.getState().setRightSidebarOpen(false);
  useLayoutStore.setState({
    showArchived: false,
    pinnedSessionIds: [],
    archivedSessionIds: [],
    expandedFileTreeFolders: [],
  });

  clearPdfCache();
  useChangesStore.getState().clearAll();
  useWorktreeStore.getState().clearAll();
  useTerminalStore.getState().resetProjectState();
  useBrowserStore.setState({ bookmarks: [], recentVisits: [], loaded: false });
  useCheckpointStore.getState().clearAll();
  useTerminalAiStore.getState().reset();
  usePermissionStore.getState().clearAllPermissions();
  useGitStore.getState().clearAll();
  useWorkspaceConfigStore.getState().reset();
  useExperimentStore.getState().reset();
}
