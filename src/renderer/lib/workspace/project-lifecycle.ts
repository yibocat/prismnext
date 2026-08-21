import { clearPdfCache } from "@/stores/compile-store";
import { useChangesStore } from "@/stores/changes-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useGitStore } from "@/stores/git-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
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
 * Refresh the focused project's file/research UI without killing other
 * conversations, permissions, or background experiments (P4 / D-5 / D-6).
 */
export async function applyWorkbenchFocusChange(): Promise<void> {
  useRightPanelStore.getState().closeAllTabs({ force: true });
  useLayoutStore.getState().setLeftSidebarOverlay(false);
  clearPdfCache();
  useChangesStore.getState().clearAll();
  useWorktreeStore.getState().clearAll();
  useGitStore.getState().clearAll();
  useWorkspaceConfigStore.getState().reset();
  useExperimentStore.getState().reset();
}
