import { modeRegistry, type RightTabKind } from "./mode-registry";
import type { RightToolbarTab } from "@/stores/layout-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

function focusModeHomeTab(): void {
  const newFocused = useLayoutStore.getState().focusedMode;
  if (newFocused === "dashboard") {
    useRightPanelStore.setState({ activeTabId: null });
    return;
  }
  const newDef = modeRegistry.get(newFocused);
  const newTab = useRightPanelStore.getState().tabs.find((t) =>
    newDef?.tabKinds.includes(t.kind),
  );
  if (newTab) useRightPanelStore.getState().setActiveTab(newTab.id);
  else useRightPanelStore.setState({ activeTabId: null });
}

/**
 * Deactivate a toolbar mode and close its tabs (shortcut / mode button toggle-off).
 * Switching *to* another mode does not call this — those tabs stay mounted.
 */
export function deactivateModeFromToolbar(
  modeId: string,
  options?: { onComplete?: () => void },
): void {
  const store = useRightPanelStore.getState();
  const def = modeRegistry.get(modeId);
  const st = useLayoutStore.getState();

  if (!def) {
    st.deactivateMode(modeId as RightToolbarTab);
    options?.onComplete?.();
    return;
  }

  const finish = () => {
    def.onDeactivate?.();
    st.deactivateMode(modeId as RightToolbarTab);
    focusModeHomeTab();
    options?.onComplete?.();
  };

  const kinds = def.tabKinds;
  const closeKindAt = (index: number) => {
    if (index >= kinds.length) {
      finish();
      return;
    }
    store.closeTabsOfKind(kinds[index], {
      onClosed: () => closeKindAt(index + 1),
    });
  };
  closeKindAt(0);
}

/** Deactivate a persistent mode (Files / Browser) when closing its empty home tab. */
export function deactivateModeByTabKind(kind: RightTabKind): void {
  const def = modeRegistry.findByTabKind(kind);
  if (!def) return;
  deactivateModeFromToolbar(def.id);
}
