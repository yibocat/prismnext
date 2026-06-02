/**
 * Shared registry mapping browser tab IDs to their <webview> DOM elements.
 *
 * BrowserToolbar (outside TabContext) needs to call goBack/goForward/reload/loadURL
 * on the webview that lives inside BrowserView (inside TabContext). This module
 * bridges that gap without threading a ref through the entire component tree.
 */
const webviewMap = new Map<string, HTMLWebViewElement>();

export function registerWebview(tabId: string, el: HTMLWebViewElement): void {
  webviewMap.set(tabId, el);
}

export function unregisterWebview(tabId: string): void {
  webviewMap.delete(tabId);
}

export function getWebview(tabId: string): HTMLWebViewElement | undefined {
  return webviewMap.get(tabId);
}
