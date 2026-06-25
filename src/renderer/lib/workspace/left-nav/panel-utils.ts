import type { LeftNavContext } from "./types";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

export function isTexWorkspaceOpen(): boolean {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  return (
    rps.tabs.some((t) => t.kind === "texworkspace") &&
    st.rightAreaExpanded &&
    st.focusedMode === "texworkspace"
  );
}

function finishTexClose(ctx: LeftNavContext, onClosed?: () => void): void {
  ctx.panelRefs.centerRef?.current?.expand();
  ctx.panelRefs.rightAreaRef?.current?.collapse();
  onClosed?.();
}

/** Close TeX Workspace tab and return layout to the chat-centered view. */
export function closeTexWorkspace(ctx: LeftNavContext, onClosed?: () => void): void {
  const st = useLayoutStore.getState();
  const rps = useRightPanelStore.getState();
  const hasTab = rps.tabs.some((t) => t.kind === "texworkspace");

  st.setEditorMaximized(false);
  if (!hasTab && st.focusedMode !== "texworkspace") {
    finishTexClose(ctx, onClosed);
    return;
  }

  st.deactivateMode("texworkspace");
  if (hasTab) {
    rps.closeTabsOfKind("texworkspace", { onClosed: () => finishTexClose(ctx, onClosed) });
  } else {
    finishTexClose(ctx, onClosed);
  }
}
