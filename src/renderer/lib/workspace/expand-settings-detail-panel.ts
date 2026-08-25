import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import { RIGHT_AREA_DEFAULT, RIGHT_AREA_MIN } from "@/styles/constants";
import {
  canSplitSettingsDetail,
  measureCenterRightWidthPx,
  resolveSettingsDetailSplitWidth,
} from "./settings-detail-layout";
import { applyShellWindowLayout, getShellLive } from "@/lib/workspace/shell-layout-controller";
import { measureMainAreaWidthPx } from "@/lib/workspace/right-area-layout";

export interface ExpandSettingsDetailPanelOptions {
  /** Width of the center-right group (settings list + detail). */
  mainAreaWidthPx?: number;
  preferredWidth?: number;
}

/**
 * Open settings detail panel — split when wide enough, stacked full-width when narrow.
 */
export function expandSettingsDetailPanel({
  mainAreaWidthPx,
  preferredWidth,
}: ExpandSettingsDetailPanelOptions = {}): void {
  if (!hasOpenSettingsEditor()) return;

  const st = useLayoutStore.getState();
  const preferred =
    preferredWidth ?? st.settingsDetailWidth ?? st.rightAreaWidth ?? RIGHT_AREA_DEFAULT;
  const live = getShellLive();
  const available = measureCenterRightWidthPx(
    live.centerPx,
    live.rightPx,
    mainAreaWidthPx ?? measureMainAreaWidthPx(),
  );

  if (canSplitSettingsDetail(available)) {
    st.setSettingsDetailStacked(false);
    st.setRightAreaExpanded(true);
    st.setSettingsDetailWidth(resolveSettingsDetailSplitWidth(available, preferred));
  } else {
    st.setSettingsDetailStacked(true);
    st.setRightAreaExpanded(true);
  }

  applyShellWindowLayout({ source: "programmatic" });
}

export function collapseSettingsDetailPanel(): void {
  const st = useLayoutStore.getState();
  const live = getShellLive();
  if (!st.editorMaximized && live.rightPx >= RIGHT_AREA_MIN && !st.settingsDetailStacked) {
    st.setSettingsDetailWidth(live.rightPx);
  }
  st.setSettingsDetailStacked(false);
  st.setRightAreaExpanded(false);
  applyShellWindowLayout({ source: "programmatic" });
}

/** Close settings editor tabs and collapse the detail pane. */
export function closeSettingsDetailPanel(): void {
  const editorTabs = useRightPanelStore
    .getState()
    .tabs.filter((t) => t.kind === "settings-editor");
  for (const tab of editorTabs) {
    useRightPanelStore.getState().closeTab(tab.id);
  }
  collapseSettingsDetailPanel();
}

/**
 * Split mode only: keep the settings list visible while the detail panel is open.
 * Stacked mode intentionally collapses the list — do not call this there.
 */
export function enforceSettingsSplitLayout(mainAreaWidthPx?: number): void {
  const st = useLayoutStore.getState();
  if (st.leftSidebarView !== "settings" || st.settingsDetailStacked) return;
  if (!hasOpenSettingsEditor()) return;
  expandSettingsDetailPanel({ mainAreaWidthPx });
}
