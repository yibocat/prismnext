import { useRef, useEffect, useState, type RefObject } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useTabContext } from "@/lib/workspace/tab-context";
import {
  isBrowsableUrl,
  navigateBrowserUrl,
  openUrlInBrowser,
} from "@/lib/browser-link";
import {
  registerWebview,
  unregisterWebview,
  markTabActive,
  wakeTab,
} from "./webview-registry";
import { BrowserHome } from "./browser-home";
import { BrowserLinkMenu } from "./browser-link-menu";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";

const MAGIC = "__PRISM_NEW_TAB__";
const LINK_MAGIC = "__PRISM_LINK_MENU__";

type PrismWebview = HTMLWebViewElement & {
  executeJavaScript?: (code: string) => Promise<unknown>;
  reload?: () => void;
  getURL?: () => string;
};

function getPrismWebview(ref: RefObject<HTMLWebViewElement | null>): PrismWebview | null {
  return ref.current as PrismWebview | null;
}

export function BrowserView() {
  const { tab, isActive } = useTabContext();
  const tabId = tab.id;
  const url = tab.url ?? "";
  const hibernated = tab.hibernated ?? false;

  const webviewRef = useRef<HTMLWebViewElement>(null);
  const webviewElRef = useRef<HTMLDivElement>(null);

  const [linkMenu, setLinkMenu] = useState<{ x: number; y: number; url: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const updateBrowserTabTitle = useRightPanelStore((s) => s.updateBrowserTabTitle);
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const setBrowserTabLoading = useRightPanelStore((s) => s.setBrowserTabLoading);
  const setTabHibernated = useRightPanelStore((s) => s.setTabHibernated);
  const recordVisit = useBrowserStore((s) => s.recordVisit);

  useEffect(() => {
    if (isActive && url) {
      const evicted = markTabActive(tabId, url);
      if (evicted) setTabHibernated(evicted, true);
      if (hibernated) {
        setTabHibernated(tabId, false);
        wakeTab(tabId);
      }
    }
  }, [isActive, url, tabId, hibernated, setTabHibernated]);

  useEffect(() => {
    const el = webviewRef.current;
    if (el) {
      registerWebview(tabId, el);
      return () => unregisterWebview(tabId);
    }
  }, [tabId, url]);

  useEffect(() => {
    const webview = getPrismWebview(webviewRef);
    if (!webview) return;

    const handlePageTitleUpdated = (e: Event & { title?: string }) => {
      const title = e.title;
      if (title && title !== "about:blank") {
        updateBrowserTabTitle(tabId, title);
        const currentUrl = webview.getURL?.() || url;
        if (currentUrl) recordVisit(currentUrl, title);
      }
    };

    webview.addEventListener("page-title-updated", handlePageTitleUpdated);
    return () => webview.removeEventListener("page-title-updated", handlePageTitleUpdated);
  }, [tabId, url, updateBrowserTabTitle, recordVisit]);

  useEffect(() => {
    const webview = getPrismWebview(webviewRef);
    if (!webview) return;

    const handleNavigation = (e: Event & { url?: string }) => {
      if (e.url) navigateBrowserTab(tabId, e.url);
    };

    webview.addEventListener("did-navigate-in-page", handleNavigation);
    webview.addEventListener("did-navigate", handleNavigation);
    return () => {
      webview.removeEventListener("did-navigate-in-page", handleNavigation);
      webview.removeEventListener("did-navigate", handleNavigation);
    };
  }, [tabId, navigateBrowserTab]);

  useEffect(() => {
    const webview = getPrismWebview(webviewRef);
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

  useEffect(() => {
    const webview = getPrismWebview(webviewRef);
    if (!webview) return;

    const handleFailLoad = (e: Event & { isMainFrame?: boolean; errorDescription?: string }) => {
      if (e.isMainFrame && e.errorDescription) {
        setLoadError(e.errorDescription);
        setBrowserTabLoading(tabId, false);
      }
    };

    webview.addEventListener("did-fail-load", handleFailLoad);
    return () => webview.removeEventListener("did-fail-load", handleFailLoad);
  }, [tabId, url, setBrowserTabLoading]);

  useEffect(() => {
    setLoadError(null);
  }, [url]);

  useEffect(() => {
    const webview = getPrismWebview(webviewRef);
    if (!webview) return;

    const handleNewWindow = (e: Event & { preventDefault?: () => void; url?: string }) => {
      e.preventDefault?.();
      if (e.url && isBrowsableUrl(e.url)) {
        openUrlInBrowser(e.url, { newTab: true });
      }
    };

    const handleConsoleMessage = (e: Event & { message?: string }) => {
      const msg = e.message ?? "";
      if (msg.startsWith(LINK_MAGIC)) {
        const parts = msg.slice(LINK_MAGIC.length).split("__");
        if (parts.length >= 3) {
          const x = parseInt(parts[0], 10);
          const y = parseInt(parts[1], 10);
          const linkUrl = parts.slice(2).join("__");
          if (linkUrl && isBrowsableUrl(linkUrl)) {
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
        if (newUrl && isBrowsableUrl(newUrl)) {
          openUrlInBrowser(newUrl, { newTab: true });
        }
      }
    };

    const injectInterceptor = () => {
      webview.executeJavaScript?.(`
        (function() {
          if (window.__prismInterceptorInstalled) return;
          window.__prismInterceptorInstalled = true;
          var MAGIC = "${MAGIC}";
          var LINK_MAGIC = "${LINK_MAGIC}";

          window.open = function(url) {
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

    webview.addEventListener("new-window", handleNewWindow);
    webview.addEventListener("dom-ready", injectInterceptor);
    webview.addEventListener("console-message", handleConsoleMessage);
    return () => {
      webview.removeEventListener("new-window", handleNewWindow);
      webview.removeEventListener("dom-ready", injectInterceptor);
      webview.removeEventListener("console-message", handleConsoleMessage);
    };
  }, [tabId, url]);

  const isLoading = useRightPanelStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.isLoading ?? false,
  );

  if (!url) {
    return <BrowserHome tabId={tabId} />;
  }

  if (hibernated) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[length:var(--font-placeholder)] text-muted-foreground">
          Tab hibernated — switch here to reload
        </p>
      </div>
    );
  }

  if (loadError) {
    const retry = () => {
      setLoadError(null);
      getPrismWebview(webviewRef)?.reload?.();
    };
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertTriangleIcon className="size-10 opacity-30" />
        <p className="text-[length:var(--font-placeholder)] text-center max-w-xs">
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
        {...{
          webpreferences: "contextIsolation=yes",
          // Isolate browser cookies/storage from the renderer's default session
          // (and from any CSP set on default session). Must match BROWSER_PARTITION
          // in src/main/ipc/browser.ts.
          partition: "persist:browser",
        } as React.HTMLAttributes<HTMLElement>}
      />

      {linkMenu && (
        <BrowserLinkMenu
          x={linkMenu.x}
          y={linkMenu.y}
          onClose={() => setLinkMenu(null)}
          onOpen={() => {
            navigateBrowserUrl(tabId, linkMenu.url);
            setLinkMenu(null);
          }}
          onOpenInNewTab={() => {
            openUrlInBrowser(linkMenu.url, { newTab: true });
            setLinkMenu(null);
          }}
        />
      )}
    </div>
  );
}
