import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { hasOpenSettingsEditor } from "@/hooks/use-settings-editor";
import {
  MAIN_AREA_MIN,
  RIGHT_AREA_DEFAULT,
  RIGHT_AREA_MIN,
} from "@/styles/constants";
import { RESIZE_FILL_PX } from "@/lib/workspace/layout-constants";
import {
  canSplitSettingsDetail,
  measureCenterRightWidthPx,
  resolveSettingsDetailSplitWidth,
} from "./settings-detail-layout";

export interface ExpandSettingsDetailPanelOptions {
  centerRef: PanelImperativeHandle | null | undefined;
  rightAreaRef: PanelImperativeHandle | null | undefined;
  /** Width of the center-right group (settings list + detail). */
  mainAreaWidthPx?: number;
  preferredWidth?: number;
}

/**
 * Open settings detail panel — split when wide enough, stacked full-width when narrow.
 */
export function expandSettingsDetailPanel({
  centerRef,
  rightAreaRef,
  mainAreaWidthPx,
  preferredWidth,
}: ExpandSettingsDetailPanelOptions): void {
  const r = rightAreaRef;
  const c = centerRef;
  if (!r) return;

  if (!hasOpenSettingsEditor()) {
    return;
  }

  const st = useLayoutStore.getState();
  const preferred =
    preferredWidth ?? st.settingsDetailWidth ?? st.rightAreaWidth ?? RIGHT_AREA_DEFAULT;

  const centerPx = c?.getSize().inPixels ?? 0;
  const rightPx = r.getSize().inPixels ?? 0;
  const available = measureCenterRightWidthPx(
    centerPx,
    rightPx,
    mainAreaWidthPx ?? window.innerWidth,
  );

  const split = canSplitSettingsDetail(available);

  if (split) {
    st.setSettingsDetailStacked(false);
    st.setRightAreaExpanded(true);
    if (r.isCollapsed()) r.expand();
    c?.expand();
    r.resize(resolveSettingsDetailSplitWidth(available, preferred));
    return;
  }

  st.setSettingsDetailStacked(true);
  st.setRightAreaExpanded(true);
  if (r.isCollapsed()) r.expand();
  c?.collapse();
  r.resize(Math.max(available, RIGHT_AREA_MIN));
}

export function collapseSettingsDetailPanel(
  centerRef: PanelImperativeHandle | null | undefined,
  rightAreaRef: PanelImperativeHandle | null | undefined,
): void {
  const r = rightAreaRef;
  const c = centerRef;
  if (!r) return;

  const st = useLayoutStore.getState();
  if (!st.editorMaximized) {
    const px = r.getSize().inPixels;
    if (px >= RIGHT_AREA_MIN && !st.settingsDetailStacked) {
      st.setSettingsDetailWidth(px);
    }
  }
  st.setSettingsDetailStacked(false);
  st.setRightAreaExpanded(false);
  r.collapse();
  c?.resize(RESIZE_FILL_PX);
}

/** Close settings editor tabs and collapse the detail pane. */
export function closeSettingsDetailPanel(
  centerRef: PanelImperativeHandle | null | undefined,
  rightAreaRef: PanelImperativeHandle | null | undefined,
): void {
  const editorTabs = useRightPanelStore
    .getState()
    .tabs.filter((t) => t.kind === "settings-editor");
  for (const tab of editorTabs) {
    useRightPanelStore.getState().closeTab(tab.id);
  }
  collapseSettingsDetailPanel(centerRef, rightAreaRef);
}

/**
 * Split mode only: keep the settings list visible while the detail panel is open.
 * Stacked mode intentionally collapses the list — do not call this there.
 */
export function enforceSettingsSplitLayout(
  centerRef: PanelImperativeHandle | null | undefined,
  rightAreaRef: PanelImperativeHandle | null | undefined,
  mainAreaWidthPx?: number,
): void {
  const st = useLayoutStore.getState();
  if (st.leftSidebarView !== "settings" || st.settingsDetailStacked) return;
  if (!hasOpenSettingsEditor()) return;

  const c = centerRef;
  const r = rightAreaRef;
  if (!c || !r || r.isCollapsed() || r.getSize().inPixels < 30) return;

  const centerPx = c.isCollapsed() ? 0 : c.getSize().inPixels;
  if (!c.isCollapsed() && centerPx >= MAIN_AREA_MIN) return;

  const rightPx = r.getSize().inPixels;
  const available = measureCenterRightWidthPx(
    centerPx,
    rightPx,
    mainAreaWidthPx ?? window.innerWidth,
  );

  c.expand();
  c.resize(MAIN_AREA_MIN);
  r.resize(resolveSettingsDetailSplitWidth(available, st.settingsDetailWidth));
}
