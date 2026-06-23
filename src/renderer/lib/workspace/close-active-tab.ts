import { modeRegistry } from "./mode-registry";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";

/**
 * App-wide Close Tab (Cmd+W). Never closes the window.
 * Returns true if a tab close was attempted.
 */
export function closeActiveTabFromShortcut(): boolean {
  const layout = useLayoutStore.getState();

  if (layout.focusedMode === "dashboard") {
    const chat = useChatStore.getState();
    if (chat.tabs.length <= 1) return false;
    const active = chat.tabs.find((t) => t.id === chat.activeTabId);
    if (!active || active.isStreaming) return false;
    chat.closeTab(active.id);
    return true;
  }

  const rp = useRightPanelStore.getState();
  let activeTab = rp.tabs.find((t) => t.id === rp.activeTabId);

  const focusedDef = modeRegistry.get(layout.focusedMode);
  if (activeTab && focusedDef && !focusedDef.tabKinds.includes(activeTab.kind)) {
    activeTab = rp.tabs.find((t) => focusedDef.tabKinds.includes(t.kind));
  }

  if (!activeTab) return false;
  return rp.requestCloseTab(activeTab.id);
}
