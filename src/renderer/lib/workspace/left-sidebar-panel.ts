import type { PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore } from "@/stores/layout-store";
import { SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX, SIDEBAR_OVERLAY_THRESHOLD } from "@/styles/constants";

/** Toggle the left sidebar panel (same behavior as the title-bar PanelLeft button). */
export function toggleLeftSidebarPanel(
  leftSidebarRef: { current: PanelImperativeHandle | null },
): void {
  const st = useLayoutStore.getState();
  if (st.leftSidebarOverlay) {
    st.setLeftSidebarOverlay(false);
    return;
  }
  const p = leftSidebarRef.current;
  if (!p) return;
  if (p.isCollapsed()) {
    if (window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD) {
      st.setLeftSidebarOverlay(true);
    } else {
      st.setLeftSidebarOverlay(false);
      st.setSidebarExpanded(true);
      st.setSidebarFullyCollapsed(false);
      p.expand();
      const width = Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX);
      p.resize(width);
    }
  } else {
    st.setSidebarExpanded(false);
    st.setSidebarFullyCollapsed(true);
    p.collapse();
  }
}
