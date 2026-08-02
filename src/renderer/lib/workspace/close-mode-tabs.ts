/**
 * Close all RightArea tabs belonging to a mode (left-nav dismiss / explicit retire).
 * Mode chrome falls out of tabs; onDeactivate fires via right-panel-store subscribe.
 */
import { modeRegistry, type RightTabKind } from "./mode-registry";
import { useRightPanelStore } from "@/stores/right-panel-store";

/** Close every tab of this mode (all tabKinds), sequentially if confirmations appear. */
export function closeModeTabs(
  modeId: string,
  options?: { onComplete?: () => void },
): void {
  const store = useRightPanelStore.getState();
  const def = modeRegistry.get(modeId);

  if (!def) {
    options?.onComplete?.();
    return;
  }

  const kinds = def.tabKinds;
  const closeKindAt = (index: number) => {
    if (index >= kinds.length) {
      options?.onComplete?.();
      return;
    }
    store.closeTabsOfKind(kinds[index], {
      onClosed: () => closeKindAt(index + 1),
    });
  };
  closeKindAt(0);
}

/** Close the mode that owns this tab kind. */
export function closeModeTabsByKind(kind: RightTabKind): void {
  const def = modeRegistry.findByTabKind(kind);
  if (!def) return;
  closeModeTabs(def.id);
}
