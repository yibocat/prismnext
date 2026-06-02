import { useState, useRef, useCallback, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useTabContext } from "@/lib/tab-context";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  GlobeIcon,
} from "lucide-react";

export function BrowserView() {
  const { tab } = useTabContext();
  const tabId = tab.id;
  const initialUrl = tab.url ?? "";

  const [url, setUrl] = useState(initialUrl);
  const [inputValue, setInputValue] = useState(initialUrl);
  const webviewRef = useRef<HTMLWebViewElement>(null);
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);

  // Sync URL from store (e.g., when sidebar bookmark is clicked)
  useEffect(() => {
    const currentTab = useRightPanelStore.getState().tabs.find((t) => t.id === tabId);
    if (currentTab?.url && currentTab.url !== url) {
      setUrl(currentTab.url);
      setInputValue(currentTab.url);
    }
  }, [tabId, url]);

  const navigate = useCallback(
    (targetUrl: string) => {
      let finalUrl = targetUrl.trim();
      if (!finalUrl) return;
      // Auto-add https:// if no protocol
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = "https://" + finalUrl;
      }
      setUrl(finalUrl);
      setInputValue(finalUrl);
      navigateBrowserTab(tabId, finalUrl);
      if (webviewRef.current) {
        (webviewRef.current as any).loadURL(finalUrl);
      }
    },
    [tabId, navigateBrowserTab],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") navigate(inputValue);
    },
    [inputValue, navigate],
  );

  const handleBack = () => (webviewRef.current as any)?.goBack();
  const handleForward = () => (webviewRef.current as any)?.goForward();
  const handleReload = () => (webviewRef.current as any)?.reload();

  // Intercept new-window events and open in a new browser tab
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const handleNewWindow = (e: any) => {
      const newUrl = e.url;
      if (!newUrl) return;
      // Prevent Electron from opening a system browser window
      e.preventDefault();
      // Create a new browser tab for this URL
      const store = useRightPanelStore.getState();
      const newTabId = store.newBrowserTab();
      store.navigateBrowserTab(newTabId, newUrl);
    };

    webview.addEventListener("new-window", handleNewWindow);
    return () => webview.removeEventListener("new-window", handleNewWindow);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Navigation Bar */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-card px-2">
        <Button
          variant="ghost" size="icon" className="size-6"
          title="Back" onClick={handleBack}
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="size-6"
          title="Forward" onClick={handleForward}
        >
          <ArrowRightIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost" size="icon" className="size-6"
          title="Reload" onClick={handleReload}
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
        <div className="flex-1 flex items-center gap-1.5 mx-1 h-6 rounded bg-muted/50 px-2">
          {url ? (
            <GlobeIcon className="size-3 shrink-0 text-muted-foreground/60" />
          ) : null}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter URL"
            className="flex-1 bg-transparent text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none"
          />
        </div>
      </div>

      {/* Webview or homepage */}
      {url ? (
        <webview
          ref={webviewRef}
          src={url}
          className="flex-1"
          style={{ width: "100%", height: "100%" }}
          {...{ allowpopups: "true" } as any}
          {...{ webpreferences: "contextIsolation=yes" } as any}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <GlobeIcon className="size-12 opacity-20" />
          <p className="text-[length:var(--font-placeholder)]">
            Enter a URL or search term above
          </p>
        </div>
      )}
    </div>
  );
}
