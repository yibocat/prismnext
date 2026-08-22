import { clearPdfCache } from "@/stores/compile-store";
import { useChangesStore } from "@/stores/changes-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useGitStore } from "@/stores/git-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useProjectStore } from "@/stores/project-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabCloseConfirmStore } from "@/stores/tab-close-confirm-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { sameProjectPath, useWorkbenchStore } from "@/stores/workbench-store";
import { loadWorkbenchSessionUiPrefs } from "@/lib/chat/session-ui-prefs";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { gitDesktop } from "@/lib/desktop-api/git";
import { projectDesktop } from "@/lib/desktop-api/project";
import { executionDesktop } from "@/lib/desktop-api/execution";
import { getProjectLastActiveFileId } from "@/lib/files/recent-files";
import { i18n } from "@/lib/i18n";
import { createLogger } from "@/services/logger";
import { terminalExecutionIsFinal, type TerminalExecutionSummary } from "../../../shared/execution";

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
  useLayoutStore.getState().setLeftSidebarOverlay(false);
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

  gitDesktop.gitWarmup(canonicalRoot).catch(() => {});
  await useWorkspaceConfigStore.getState().loadConfig(canonicalRoot);
  if (shouldAbort()) return;

  void import("@/stores/literature-store").then(({ useLiteratureStore }) => {
    if (shouldAbort()) return;
    void useLiteratureStore.getState().refresh(canonicalRoot);
  });

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
