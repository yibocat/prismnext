/**
 * Shared registry mapping browser tab IDs to their <webview> DOM elements.
 *
 * BrowserToolbar (outside TabContext) needs to call goBack/goForward/reload/loadURL
 * on the webview that lives inside BrowserView (inside TabContext). This module
 * bridges that gap without threading a ref through the entire component tree.
 *
 * Also manages tab hibernation: when too many browser tabs are open, the least
 * recently used tabs are hibernated (webview unloaded → memory freed). When the
 * user switches back, the tab wakes and reloads its URL.
 */

// ─── Webview ref registry ───

const webviewMap = new Map<string, HTMLWebViewElement>();

export function registerWebview(tabId: string, el: HTMLWebViewElement): void {
  webviewMap.set(tabId, el);
}

export function unregisterWebview(tabId: string): void {
  removeTab(tabId);
}

export function getWebview(tabId: string): HTMLWebViewElement | undefined {
  return webviewMap.get(tabId);
}

// ─── Tab hibernation (LRU eviction) ───

/** Maximum number of simultaneously active (non-hibernated) webview tabs. */
const MAX_ACTIVE_WEBVIEWS = 5;

/** LRU-ordered list of active tab IDs (most recent at the end). */
const activeOrder: string[] = [];

/** Tabs whose webview has been unloaded to save memory. */
const hibernated = new Set<string>();

/**
 * Notify the registry that this tab is now active. Updates LRU order.
 * If the active count exceeds the limit, returns the tab ID that should
 * be hibernated (the least recently used one), or null if within limits.
 */
export function markTabActive(tabId: string, url: string): string | null {
  // Ignore empty tabs
  if (!url) return null;

  // Wake from hibernation if needed
  hibernated.delete(tabId);

  // Move to end of LRU list (most recently used)
  const idx = activeOrder.indexOf(tabId);
  if (idx >= 0) activeOrder.splice(idx, 1);
  activeOrder.push(tabId);

  // Prune dead entries from LRU list
  while (activeOrder.length > 0 && !webviewMap.has(activeOrder[0])) {
    activeOrder.shift();
  }

  // If over limit, evict the least recently used
  if (activeOrder.length > MAX_ACTIVE_WEBVIEWS) {
    // Find first non-empty, non-hibernated candidate
    for (let i = 0; i < activeOrder.length - 1; i++) {
      const candidate = activeOrder[i];
      if (!hibernated.has(candidate) && webviewMap.has(candidate)) {
        hibernated.add(candidate);
        activeOrder.splice(i, 1);
        return candidate;
      }
    }
  }

  return null;
}

/** Whether a tab is currently hibernated. */
export function isTabHibernated(tabId: string): boolean {
  return hibernated.has(tabId);
}

/** Wake a hibernated tab — called when the user switches to it. */
export function wakeTab(tabId: string): void {
  hibernated.delete(tabId);
}

/** Clean up all tracking for a tab that is being closed. */
export function removeTab(tabId: string): void {
  webviewMap.delete(tabId);
  hibernated.delete(tabId);
  const idx = activeOrder.indexOf(tabId);
  if (idx >= 0) activeOrder.splice(idx, 1);
}
