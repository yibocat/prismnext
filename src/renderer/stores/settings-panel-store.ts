import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { closeAllSettingsEditorTabs } from "@/hooks/use-settings-editor";
import type { SettingsPanelSlot } from "@/lib/settings/settings-panel-slots";

/** Open a settings editor in the unified RightArea (creates/updates settings-editor tab). */
export function openSettingsPanel(slot: SettingsPanelSlot): void {
  const st = useLayoutStore.getState();
  const rp = useRightPanelStore.getState();
  const hadEditorTab = rp.tabs.some((t) => t.kind === "settings-editor");
  const keepSplitLayout =
    st.leftSidebarView === "settings" &&
    hadEditorTab &&
    st.rightAreaExpanded &&
    !st.settingsDetailStacked;

  rp.openSettingsEditorTab(slot);

  if (!keepSplitLayout) {
    st.requestRightAreaExpand();
  }
}

/** Close settings editor tabs and collapse RightArea (via App layout refs). */
export function closeSettingsPanel(): void {
  useLayoutStore.getState().requestCloseSettingsDetailPanel();
}

/** Leave settings nav: close editors and clear stacked layout state. */
export function resetSettingsEditors(): void {
  useLayoutStore.getState().setSettingsDetailStacked(false);
  closeAllSettingsEditorTabs();
}
