import { useRef, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useTabContext } from "@/lib/tab-context";
import { registerWebview, unregisterWebview } from "@/components/modules/browser/webview-registry";
import { GlobeIcon } from "lucide-react";

export function BrowserView() {
  const { tab } = useTabContext();
  const tabId = tab.id;
  const url = tab.url ?? "";

  const webviewRef = useRef<HTMLWebViewElement>(null);
  const newBrowserTab = useRightPanelStore((s) => s.newBrowserTab);
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const updateBrowserTabTitle = useRightPanelStore((s) => s.updateBrowserTabTitle);
  const recordVisit = useBrowserStore((s) => s.recordVisit);

  // Register webview ref so BrowserToolbar can access it
  useEffect(() => {
    const el = webviewRef.current;
    if (el) {
      registerWebview(tabId, el);
      return () => unregisterWebview(tabId);
    }
  }, [tabId]);

  // Sync page title from webview → tab title + recent visits
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handlePageTitleUpdated = (e: any) => {
      const title = e.title;
      if (title && title !== "about:blank") {
        updateBrowserTabTitle(tabId, title);
        // Record visit when title is known (confirms page loaded)
        const currentUrl = (webview as any).getURL?.() || url;
        if (currentUrl) recordVisit(currentUrl, title);
      }
    };

    webview.addEventListener("page-title-updated", handlePageTitleUpdated);
    return () => webview.removeEventListener("page-title-updated", handlePageTitleUpdated);
  }, [tabId, url, updateBrowserTabTitle, recordVisit]);

  // Listen for page URL changes (in-page navigation via pushState)
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleNavigation = (e: any) => {
      if (e.url) {
        navigateBrowserTab(tabId, e.url);
      }
    };

    webview.addEventListener("did-navigate-in-page", handleNavigation);
    webview.addEventListener("did-navigate", handleNavigation);
    return () => {
      webview.removeEventListener("did-navigate-in-page", handleNavigation);
      webview.removeEventListener("did-navigate", handleNavigation);
    };
  }, [tabId, navigateBrowserTab]);

  // Intercept new-window events → create a new browser tab
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleNewWindow = (e: any) => {
      const newUrl = e.url;
      if (!newUrl) return;
      e.preventDefault();
      const newTabId = newBrowserTab();
      navigateBrowserTab(newTabId, newUrl);
    };

    webview.addEventListener("new-window", handleNewWindow);
    return () => webview.removeEventListener("new-window", handleNewWindow);
  }, [newBrowserTab, navigateBrowserTab]);

  // Empty state — no URL entered yet
  if (!url) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <GlobeIcon className="size-12 opacity-20" />
        <p className="text-[length:var(--font-placeholder)]">
          Enter a URL or search term above
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <webview
        ref={webviewRef}
        src={url}
        className="flex-1"
        style={{ width: "100%", height: "100%" }}
        {...{ allowpopups: "true" } as any}
        {...{ webpreferences: "contextIsolation=yes" } as any}
      />
    </div>
  );
}
