import { useLayoutStore } from "@/stores/layout-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { focusedModeId } from "@/lib/workspace/modes-from-tabs";
import { isBrowsableUrl, normalizeBrowserUrl } from "./normalize";

export function activateBrowserMode(): void {
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
 * Pick a Browser tab for opportunistic URL open (not an explicit「new tab」).
 * Prefer the focused Browser tab, else an unused home (isInitial), else create.
 */
function resolveTabForUrlOpen(): string {
  const rp = useRightPanelStore.getState();
  const active = rp.tabs.find((t) => t.id === rp.activeTabId);

  if (focusedModeId(rp.tabs, rp.activeTabId) === "browser" && active?.kind === "browser") {
    return active.id;
  }

  const idleHome = rp.tabs.find((t) => t.kind === "browser" && t.isInitial);
  if (idleHome) {
    rp.setActiveTab(idleHome.id);
    return idleHome.id;
  }

  return rp.newBrowserTab();
}

/**
 * Open URL in in-app Browser: expand RightArea, activate mode, navigate.
 * Never opens the OS browser.
 *
 * `newTab: true` always spawns a blank tab first (same as「+」→ Browser).
 * Default reuses the focused Browser tab or an idle home when available.
 */
export function openUrlInBrowser(url: string, options?: { newTab?: boolean }): string | null {
  const normalized = normalizeBrowserUrl(url);
  if (!isBrowsableUrl(normalized)) return null;

  requestRightAreaExpand();
  activateBrowserMode();

  const rp = useRightPanelStore.getState();
  const tabId = options?.newTab ? rp.newBrowserTab() : resolveTabForUrlOpen();

  navigateBrowserUrl(tabId, normalized);
  return tabId;
}
