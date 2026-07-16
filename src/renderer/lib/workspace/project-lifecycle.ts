import { clearPdfCache } from "@/stores/compile-store";
import { useChatStore } from "@/stores/chat-store";
import { useChangesStore } from "@/stores/changes-store";
import { useCheckpointStore } from "@/stores/checkpoint-store";
import { useExperimentStore } from "@/stores/experiment-store";
import { useGitStore } from "@/stores/git-store";
import { useLayoutStore } from "@/stores/layout-store";
import { usePermissionStore } from "@/stores/permission-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTerminalAiStore } from "@/stores/terminal-ai-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useWorktreeStore } from "@/stores/worktree-store";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";

/**
 * Tear down in-memory state that must not leak across projects.
 * Called at the start of openProject and from closeProject.
 */
export async function resetApplicationStateForProjectSwitch(): Promise<void> {
  await window.electronAPI.chatDispose();
  void window.electronAPI.terminalDestroyAllAiPty();

  useRightPanelStore.getState().closeAllTabs();
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
