import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { isBrowsableUrl, normalizeBrowserUrl } from "./normalize";

export function activateBrowserMode(): void {
  const layout = useLayoutStore.getState();
  if (!layout.activeModes.includes("browser")) {
    layout.activateMode("browser");
  } else {
    layout.setFocusedMode("browser");
  }
  useRightPanelStore.getState().ensureTab("browser");
}

/** Expand RightArea panel (handled in App.tsx via layout-store nonce). */
export function requestRightAreaExpand(): void {
  useLayoutStore.getState().requestRightAreaExpand();
}

export function navigateBrowserUrl(tabId: string, url: string): void {
  const normalized = normalizeBrowserUrl(url);
  if (!isBrowsableUrl(normalized)) return;
  const rp = useRightPanelStore.getState();
  rp.setActiveTab(tabId);
  // Store update only — BrowserView loads via a single loadURL path.
  // A second loadURL here races the src/loadURL effect and aborts redirects.
  rp.navigateBrowserTab(tabId, normalized);
}

/**
 * Open URL in in-app Browser: expand RightArea, activate mode, navigate.
 * Never opens the OS browser.
 */
export function openUrlInBrowser(url: string, options?: { newTab?: boolean }): string | null {
  const normalized = normalizeBrowserUrl(url);
  if (!isBrowsableUrl(normalized)) return null;

  requestRightAreaExpand();
  activateBrowserMode();

  const rp = useRightPanelStore.getState();
  let tabId: string;

  if (options?.newTab) {
    tabId = rp.newBrowserTab();
  } else {
    const layout = useLayoutStore.getState();
    const active = rp.tabs.find((t) => t.id === rp.activeTabId);
    if (layout.focusedMode === "browser" && active?.kind === "browser") {
      tabId = active.id;
    } else {
      tabId = rp.newBrowserTab();
    }
  }

  navigateBrowserUrl(tabId, normalized);
  return tabId;
}
