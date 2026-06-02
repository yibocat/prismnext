import { useRef, useEffect, useState, useCallback } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useTabContext } from "@/lib/tab-context";
import {
  registerWebview,
  unregisterWebview,
  markTabActive,
  wakeTab,
} from "@/components/modules/browser/webview-registry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalLinkIcon, PlusSquareIcon, AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

export function BrowserView() {
  const { tab, isActive } = useTabContext();
  const tabId = tab.id;
  const url = tab.url ?? "";
  const hibernated = tab.hibernated ?? false;

  const webviewRef = useRef<HTMLWebViewElement>(null);
  const webviewElRef = useRef<HTMLDivElement>(null);

  // Link context menu state (populated by webview JS)
  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; url: string } | null>(null);

  // Page load error state
  const [loadError, setLoadError] = useState<string | null>(null);

  const newBrowserTab = useRightPanelStore((s) => s.newBrowserTab);
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const updateBrowserTabTitle = useRightPanelStore((s) => s.updateBrowserTabTitle);
  const setBrowserTabLoading = useRightPanelStore((s) => s.setBrowserTabLoading);
  const setTabHibernated = useRightPanelStore((s) => s.setTabHibernated);
  const recordVisit = useBrowserStore((s) => s.recordVisit);

  // ─── Hibernation management ───
  // When this tab becomes active, mark it as active in the LRU registry.
  // If another tab needs to be evicted, hibernate it via the store.
  useEffect(() => {
    if (isActive && url) {
      const evicted = markTabActive(tabId, url);
      if (evicted) {
        // Hibernate the evicted tab — its BrowserView will re-render
        // and unmount its webview
        setTabHibernated(evicted, true);
      }
      // Wake this tab if it was hibernated
      if (hibernated) {
        setTabHibernated(tabId, false);
        wakeTab(tabId);
      }
    }
  }, [isActive, url, tabId]);

  // ─── Webview lifecycle ───

  // Register webview ref so BrowserToolbar can access it
  useEffect(() => {
    const el = webviewRef.current;
    if (el) {
      registerWebview(tabId, el);
      return () => unregisterWebview(tabId);
    }
  }, [tabId, url]);

  // Sync page title from webview → tab title + recent visits
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handlePageTitleUpdated = (e: any) => {
      const title = e.title;
      if (title && title !== "about:blank") {
        updateBrowserTabTitle(tabId, title);
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
  }, [tabId, url, navigateBrowserTab]);

  // Track page loading state for progress bar / button feedback
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleStartLoading = () => setBrowserTabLoading(tabId, true);
    const handleStopLoading = () => setBrowserTabLoading(tabId, false);

    webview.addEventListener("did-start-loading", handleStartLoading);
    webview.addEventListener("did-stop-loading", handleStopLoading);
    return () => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
    };
  }, [tabId, url, setBrowserTabLoading]);

  // Track page load errors
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleFailLoad = (e: any) => {
      // Only show errors for the main frame, ignore iframe/subframe failures
      if (e.isMainFrame && e.errorDescription) {
        setLoadError(e.errorDescription);
        setBrowserTabLoading(tabId, false);
      }
    };

    webview.addEventListener("did-fail-load", handleFailLoad);
    return () => webview.removeEventListener("did-fail-load", handleFailLoad);
  }, [tabId, url, setBrowserTabLoading]);

  // Clear error when navigating to a new URL
  useEffect(() => {
    setLoadError(null);
  }, [url]);

  // Intercept target="_blank" links and window.open() via script injection
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const MAGIC = "__PRISM_NEW_TAB__";
    const LINK_MAGIC = "__PRISM_LINK_MENU__";

    const handleConsoleMessage = (e: any) => {
      const msg: string = e.message ?? "";
      if (msg.startsWith(LINK_MAGIC)) {
        const parts = msg.slice(LINK_MAGIC.length).split("__");
        if (parts.length >= 3) {
          const x = parseInt(parts[0], 10);
          const y = parseInt(parts[1], 10);
          const linkUrl = parts.slice(2).join("__"); // URL may contain __
          if (linkUrl && /^https?:\/\//i.test(linkUrl)) {
            // Adjust coordinates relative to the webview element
            const rect = webviewElRef.current?.getBoundingClientRect();
            setLinkMenu({
              x: rect ? rect.left + x : x,
              y: rect ? rect.top + y : y,
              url: linkUrl,
            });
          }
        }
        return;
      }
      if (msg.startsWith(MAGIC)) {
        const newUrl = msg.slice(MAGIC.length);
        if (newUrl && /^https?:\/\//i.test(newUrl)) {
          const newTabId = newBrowserTab();
          navigateBrowserTab(newTabId, newUrl);
        }
      }
    };

    const injectInterceptor = () => {
      webview.executeJavaScript(`
        (function() {
          if (window.__prismInterceptorInstalled) return;
          window.__prismInterceptorInstalled = true;
          var MAGIC = "${MAGIC}";
          var LINK_MAGIC = "${LINK_MAGIC}";

          var _origOpen = window.open;
          window.open = function(url, target, features) {
            if (url && url !== "about:blank" && url !== "") {
              console.log(MAGIC + url);
            }
            return null;
          };

          document.addEventListener("click", function(e) {
            var el = e.target;
            while (el && el.tagName !== "A") el = el.parentElement;
            if (el && el.target === "_blank" && el.href) {
              if (!el.href.startsWith("javascript:") && el.href !== "#" && !el.href.startsWith("#")) {
                e.preventDefault();
                e.stopPropagation();
                console.log(MAGIC + el.href);
              }
            }
          }, true);

          // Right-click on links → show custom context menu
          document.addEventListener("contextmenu", function(e) {
            var el = e.target;
            while (el && el.tagName !== "A") el = el.parentElement;
            if (el && el.href && !el.href.startsWith("javascript:") && el.href !== "#" && !el.href.startsWith("#")) {
              e.preventDefault();
              e.stopPropagation();
              console.log(LINK_MAGIC + e.clientX + "__" + e.clientY + "__" + el.href);
            }
          }, true);
        })();
      `).catch(() => {});
    };

    webview.addEventListener("dom-ready", injectInterceptor);
    webview.addEventListener("console-message", handleConsoleMessage);
    return () => {
      webview.removeEventListener("dom-ready", injectInterceptor);
      webview.removeEventListener("console-message", handleConsoleMessage);
    };
  }, [tabId, url, newBrowserTab, navigateBrowserTab]);

  const isLoading = useRightPanelStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.isLoading ?? false,
  );

  // ─── Render: empty state ───
  if (!url) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          Enter a URL or search term above
        </p>
      </div>
    );
  }

  // ─── Render: hibernated (webview unloaded to save memory) ───
  if (hibernated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          Tab hibernated — switch here to reload
        </p>
      </div>
    );
  }

  // ─── Render: load error ───
  if (loadError) {
    const retry = () => {
      setLoadError(null);
      const wv = webviewRef.current as any;
      if (wv) wv.reload();
    };
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangleIcon className="size-10 opacity-30" />
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground text-center max-w-xs">
          {loadError}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[length:var(--font-size-12)] text-primary hover:underline"
          onClick={retry}
        >
          <RefreshCwIcon className="size-3.5" />
          Retry
        </button>
      </div>
    );
  }

  // ─── Render: live webview ───
  return (
    <div ref={webviewElRef} className="flex h-full flex-col min-h-0">
      {isLoading && (
        <div className="h-0.5 shrink-0 bg-primary/30 overflow-hidden">
          <div className="h-full w-1/3 bg-primary animate-[loading-bar_1.2s_ease-in-out_infinite]" />
        </div>
      )}
      <webview
        ref={webviewRef}
        src={url}
        className="flex-1"
        style={{ width: "100%", height: "100%" }}
        {...{ webpreferences: "contextIsolation=yes" } as any}
      />

      {/* Link context menu — shown when right-clicking a link in the webview */}
      {linkMenu && (
        <DropdownMenu
          open={true}
          onOpenChange={(open) => { if (!open) setLinkMenu(null); }}
        >
          <DropdownMenuTrigger asChild>
            <div
              className="fixed size-0"
              style={{ left: linkMenu.x, top: linkMenu.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44">
            <DropdownMenuItem
              onClick={() => {
                navigateBrowserTab(tabId, linkMenu.url);
                const wv = webviewRef.current as any;
                if (wv) wv.loadURL(linkMenu.url);
                setLinkMenu(null);
              }}
            >
              <ExternalLinkIcon className="size-3.5 mr-2" />
              Open
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                const newTabId = newBrowserTab();
                navigateBrowserTab(newTabId, linkMenu.url);
                setLinkMenu(null);
              }}
            >
              <PlusSquareIcon className="size-3.5 mr-2" />
              Open in New Tab
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
