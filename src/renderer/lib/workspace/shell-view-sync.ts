/**
 * Left-nav view transitions for the pixel shell.
 *
 * Park / restore RightArea here — do not call `closeRightArea`, which clears
 * `pendingRightAreaRestore`. Settings ↔ Templates/Teams must keep that flag
 * so the workspace panel does not flash open.
 */
import { hasOpenSettingsEditor, isSettingsEditorTab } from "@/hooks/use-settings-editor";
import {
  collapseSettingsDetailPanel,
  closeSettingsDetailPanel,
  expandSettingsDetailPanel,
} from "@/lib/workspace/expand-settings-detail-panel";
import { leftNavRegistry } from "@/lib/workspace/left-nav";
import { openRightArea } from "@/lib/workspace/right-area-layout";
import { applyShellWindowLayout, getShellLive } from "@/lib/workspace/shell-layout-controller";
import { useLayoutStore, type LeftSidebarView } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { RIGHT_AREA_MIN } from "@/styles/constants";

export function syncShellForLeftSidebarView(
  prev: LeftSidebarView,
  next: LeftSidebarView,
  opts?: { isMobile?: boolean },
): void {
  if (prev === next) return;
  const isMobile = opts?.isMobile ?? false;
  const prevSettings = prev === "settings";
  const nextSettings = next === "settings";

  if (nextSettings && !prevSettings) {
    snapshotWorkspaceTab();
    parkWorkspaceRightArea();
    const st = useLayoutStore.getState();
    if (st.editorMaximized) st.setEditorMaximized(false);
    if (hasOpenSettingsEditor()) {
      expandSettingsDetailPanel();
    } else {
      collapseSettingsDetailPanel();
    }
    return;
  }

  if (prevSettings && !nextSettings) {
    if (hasOpenSettingsEditor()) {
      closeSettingsDetailPanel();
    } else {
      collapseSettingsDetailPanel();
    }
    restoreWorkspaceTab();

    if (isImmersiveView(next)) {
      keepParkedWorkspaceRight();
      return;
    }

    const st = useLayoutStore.getState();
    if (st.pendingRightAreaRestore) {
      st.clearPendingRightAreaRestore();
      openRightArea({ isMobile });
      return;
    }
    applyShellWindowLayout({ source: "programmatic" });
    return;
  }

  if (isImmersiveView(next) && !isImmersiveView(prev)) {
    parkWorkspaceRightArea();
    return;
  }

  if (!isImmersiveView(next) && isImmersiveView(prev)) {
    const st = useLayoutStore.getState();
    if (st.pendingRightAreaRestore && !st.rightAreaExpanded) {
      st.clearPendingRightAreaRestore();
      openRightArea({ isMobile });
    }
  }
}

/** Open or collapse Settings detail while already on the Settings view. */
export function syncSettingsDetailPresence(open: boolean): void {
  if (useLayoutStore.getState().leftSidebarView !== "settings") return;
  if (open) {
    expandSettingsDetailPanel();
    return;
  }
  collapseSettingsDetailPanel();
}

function isImmersiveView(view: LeftSidebarView): boolean {
  return leftNavRegistry.isImmersiveCenterView(view);
}

function snapshotWorkspaceTab(): void {
  const rp = useRightPanelStore.getState();
  const active = rp.tabs.find((tab) => tab.id === rp.activeTabId);
  if (active && !isSettingsEditorTab(active)) {
    useLayoutStore.getState().setWorkspaceActiveTabIdBeforeSettings(rp.activeTabId);
  }
}

function restoreWorkspaceTab(): void {
  const st = useLayoutStore.getState();
  const snapshot = st.workspaceActiveTabIdBeforeSettings;
  if (!snapshot) return;
  st.setWorkspaceActiveTabIdBeforeSettings(null);
  const rp = useRightPanelStore.getState();
  if (rp.tabs.some((tab) => tab.id === snapshot)) {
    rp.setActiveTab(snapshot);
  }
}

/** Close workspace Right without clearing the restore flag. */
function parkWorkspaceRightArea(): void {
  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded) {
    st.setPendingRightAreaRestore(true);
    if (!st.editorMaximized) {
      const widthPx = getShellLive().rightPx;
      if (widthPx >= RIGHT_AREA_MIN) st.setRightAreaWidth(widthPx);
    }
  }
  if (st.editorMaximized) st.setEditorMaximized(false);
  if (st.rightAreaExpanded) st.setRightAreaExpanded(false);
  applyShellWindowLayout({ source: "programmatic" });
}

function keepParkedWorkspaceRight(): void {
  const st = useLayoutStore.getState();
  if (st.editorMaximized) st.setEditorMaximized(false);
  if (st.rightAreaExpanded) st.setRightAreaExpanded(false);
  applyShellWindowLayout({ source: "programmatic" });
}
