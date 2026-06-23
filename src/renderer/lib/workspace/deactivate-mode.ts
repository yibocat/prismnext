import { modeRegistry, type RightTabKind } from "./mode-registry";
import type { RightToolbarTab } from "@/stores/layout-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

/** Deactivate a persistent mode (Files / Browser) when closing its empty home tab. */
export function deactivateModeByTabKind(kind: RightTabKind): void {
  const def = modeRegistry.findByTabKind(kind);
  if (!def) return;

  const store = useRightPanelStore.getState();
  const kinds = def.tabKinds;

  const finish = () => {
    def.onDeactivate?.();
    useLayoutStore.getState().deactivateMode(def.id as RightToolbarTab);

    const newFocused = useLayoutStore.getState().focusedMode;
    if (newFocused === "dashboard") {
      useRightPanelStore.setState({ activeTabId: null });
      return;
    }
    const newDef = modeRegistry.get(newFocused);
    const newTab = useRightPanelStore.getState().tabs.find((t) =>
      newDef?.tabKinds.includes(t.kind),
    );
    if (newTab) store.setActiveTab(newTab.id);
    else useRightPanelStore.setState({ activeTabId: null });
  };

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
