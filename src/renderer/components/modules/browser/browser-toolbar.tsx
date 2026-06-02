import { useState, useCallback, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { getWebview } from "@/components/modules/browser/webview-registry";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  GlobeIcon,
  StarIcon,
} from "lucide-react";

interface BrowserToolbarProps {
  /** The browser tab id (from RightTab) */
  tabId: string;
  /** Current URL from the tab store */
  tabUrl: string;
  /** Current tab title */
  tabTitle: string;
}

export function BrowserToolbar({ tabId, tabUrl, tabTitle }: BrowserToolbarProps) {
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const addBookmark = useBrowserStore((s) => s.addBookmark);

  const [inputValue, setInputValue] = useState(tabUrl);

  useEffect(() => {
    setInputValue(tabUrl);
  }, [tabUrl]);

  const navigate = useCallback(
    (targetUrl: string) => {
      let finalUrl = targetUrl.trim();
      if (!finalUrl) return;
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = "https://" + finalUrl;
      }
      setInputValue(finalUrl);
      navigateBrowserTab(tabId, finalUrl);
      const wv = getWebview(tabId);
      if (wv) (wv as any).loadURL(finalUrl);
    },
    [tabId, navigateBrowserTab],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") navigate(inputValue);
    },
    [inputValue, navigate],
  );

  const handleBack = () => {
    const wv = getWebview(tabId);
    if (wv) (wv as any).goBack();
  };

  const handleForward = () => {
    const wv = getWebview(tabId);
    if (wv) (wv as any).goForward();
  };

  const handleReload = () => {
    const wv = getWebview(tabId);
    if (wv) (wv as any).reload();
  };

  const handleBookmark = () => {
    const displayTitle = tabTitle && tabTitle !== "New Tab" ? tabTitle : inputValue;
    addBookmark(displayTitle, inputValue);
  };

  return (
    <>
      {/* Nav buttons */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Back"
        onClick={handleBack}
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Forward"
        onClick={handleForward}
      >
        <ArrowRightIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Reload"
        onClick={handleReload}
      >
        <RefreshCwIcon className="size-3.5" />
      </button>

      <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

      {/* URL bar */}
      <div className="flex-1 flex items-center gap-1.5 h-6 rounded bg-muted/50 px-2 min-w-0">
        <GlobeIcon className="size-3 shrink-0 text-muted-foreground/60" />
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search or enter URL"
          className="flex-1 bg-transparent text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none min-w-0"
        />
      </div>

      <div className="mx-1 h-4 w-px bg-border/60 shrink-0" />

      {/* Bookmark current page */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Bookmark this page"
        onClick={handleBookmark}
      >
        <StarIcon className="size-3.5" />
      </button>
    </>
  );
}
