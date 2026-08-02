/**
 * Keyboard helpers for opening RightArea modes (open/focus — does not close tabs).
 */
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { openMode } from "@/lib/workspace/open-right-area-mode";
import { focusedModeId } from "@/lib/workspace/modes-from-tabs";
import {
  closeRightArea,
  openRightArea,
  openRightAreaMaximized,
  type RightAreaLayoutCtx,
} from "@/lib/workspace/right-area-layout";

function isModeFocused(modeId: string): boolean {
  const rp = useRightPanelStore.getState();
  return focusedModeId(rp.tabs, rp.activeTabId) === modeId;
}

/** Shortcuts: reuse existing session if any, else create home / first tab. */
export function focusWorkspaceMode(modeId: string): void {
  openMode(modeId, { intent: "focus" });
}

/** Split open; if already split + focused, ensure focus only. */
export function openModeInSplit(
  modeId: string,
  ctx: RightAreaLayoutCtx,
): void {
  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && !st.editorMaximized && isModeFocused(modeId)) {
    openMode(modeId, { intent: "focus" });
    return;
  }
  openRightArea(ctx);
  openMode(modeId, { intent: "add" });
}

/**
 * Maximize open. If already maximized + focused, collapse L1 only (tabs stay).
 */
export function openModeMaximized(
  modeId: string,
  ctx: RightAreaLayoutCtx,
): void {
  const st = useLayoutStore.getState();
  if (st.rightAreaExpanded && st.editorMaximized && isModeFocused(modeId)) {
    closeRightArea(ctx);
    return;
  }
  openRightAreaMaximized(ctx);
  openMode(modeId, { intent: "add" });
}
