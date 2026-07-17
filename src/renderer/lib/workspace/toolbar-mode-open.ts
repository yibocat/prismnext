/**
 * Activate / deactivate RightArea toolbar modes (Files, Git, Browser, Terminal)
 * for keyboard shortcuts — mirrors right-area handleModeClick lifecycle.
 */
import type { RightToolbarTab } from "@/stores/layout-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { modeRegistry } from "@/lib/workspace/mode-registry";
import { deactivateModeFromToolbar } from "@/lib/workspace/deactivate-mode";
import {
  closeRightArea,
  openRightArea,
  openRightAreaMaximized,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

function isModeFocused(modeId: string): boolean {
  const st = useLayoutStore.getState();
  return (
    st.activeModes.includes(modeId as RightToolbarTab) && st.focusedMode === modeId
  );
}

/** Ensure mode is active with a home tab (same rules as toolbar first click). */
export function activateToolbarMode(modeId: string): void {
  const store = useRightPanelStore.getState();
  const def = modeRegistry.get(modeId);
  const st = useLayoutStore.getState();

  st.activateMode(modeId as RightToolbarTab);
  if (!def) return;

  if (modeId === "terminal" && store.hasTabsOfKind("terminal")) {
    const tab = store.tabs.find((t) => t.kind === "terminal");
    if (tab) store.setActiveTab(tab.id);
  } else {
    const kind = def.tabKinds[0];
    if (kind) {
      if (modeId === "terminal") {
        store.newTerminalTab();
      } else {
        store.ensureTab(kind);
      }
    }
  }
  def.onActivate?.();
}

/** Split open (toggle off when already split + focused). */
export function toggleToolbarModeSplit(
  modeId: string,
  ctx: RightAreaLayoutCtx,
): void {
  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && !st.editorMaximized && isModeFocused(modeId)) {
    deactivateModeFromToolbar(modeId);
    return;
  }
  openRightArea(ctx);
  activateToolbarMode(modeId);
}

/** Maximize open (toggle off when already maximized + focused). */
export function toggleToolbarModeMaximize(
  modeId: string,
  ctx: RightAreaLayoutCtx,
): void {
  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && st.editorMaximized && isModeFocused(modeId)) {
    deactivateModeFromToolbar(modeId);
    closeRightArea(ctx);
    return;
  }
  openRightAreaMaximized(ctx);
  activateToolbarMode(modeId);
}
