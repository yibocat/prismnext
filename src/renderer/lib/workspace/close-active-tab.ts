import { isDisposableEmptyChatTab } from "@/lib/chat/session-title";
import { useChatStore } from "@/stores/chat-store";
import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { closeRightArea } from "@/lib/workspace/right-area-layout";
import { getLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";

export type CloseShortcutResult = "handled" | "close-window";

/** Exit maximize (if any) and collapse RightArea after the last workspace tab closes. */
function collapseRightShell(): void {
  const refs = getLeftNavPanelRefs();
  closeRightArea({
    centerRef: refs.centerRef?.current,
    rightAreaRef: refs.rightAreaRef?.current,
  });
}

function resolveRightAreaTabToClose() {
  const rp = useRightPanelStore.getState();
  return rp.tabs.find((t) => t.id === rp.activeTabId) ?? rp.tabs[0] ?? null;
}

/**
 * App-wide Close (Cmd+W) cascade:
 * 1. RightArea expanded with tabs → close current RightArea tab;
 *    when none remain → exit maximize + collapse RightArea.
 * 2. RightArea collapsed → chat sessions (stored RightArea tabs ignored):
 *    - multiple tabs → close current (prefer non-streaming);
 *    - sole disposable empty New Chat → close window;
 *    - sole tab with content → open a fresh session, then close the old one;
 *    - sole streaming tab → close window.
 */
export function closeActiveTabFromShortcut(): CloseShortcutResult {
  const layout = useLayoutStore.getState();
  const rp = useRightPanelStore.getState();

  // Layer 1 — RightArea workspace tabs
  if (layout.rightAreaExpanded) {
    if (rp.tabs.length === 0) {
      collapseRightShell();
      return "handled";
    }

    const tab = resolveRightAreaTabToClose();
    if (!tab) {
      collapseRightShell();
      return "handled";
    }

    rp.requestCloseTab(tab.id, {
      onAfterClose: () => {
        if (useRightPanelStore.getState().tabs.length === 0) {
          collapseRightShell();
        }
      },
    });
    return "handled";
  }

  // Layer 2 — chat tabs (only when RightArea is already collapsed)
  const chat = useChatStore.getState();
  const active = chat.tabs.find((t) => t.id === chat.activeTabId);
  const closable = chat.tabs.filter((t) => !t.isStreaming);

  if (closable.length === 0) {
    return "close-window";
  }

  if (chat.tabs.length === 1) {
    const only = chat.tabs[0];
    if (only.isStreaming) return "close-window";
    if (isDisposableEmptyChatTab(only)) return "close-window";

    // Last tab has content — replace with a fresh blank session (keep the window).
    const oldId = only.id;
    chat.createTab();
    chat.closeTab(oldId);
    return "handled";
  }

  if (active && !active.isStreaming) {
    chat.closeTab(active.id);
    return "handled";
  }

  // Active is streaming — close another non-streaming tab if any.
  const other = closable[0];
  if (other) {
    chat.closeTab(other.id);
    return "handled";
  }

  return "close-window";
}
