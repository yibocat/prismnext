import { useState, useCallback, useEffect } from "react";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { getWebview } from "./webview-registry";
import { cn } from "@/lib/utils";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  RefreshCwIcon,
  GlobeIcon,
  StarIcon,
  EllipsisIcon,
} from "lucide-react";

/** Normalize URL for comparison: strip trailing slash, fragment, and www prefix */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname;
    if (path.endsWith("/") && path !== "/") path = path.slice(0, -1);
    return `${u.protocol}//${u.hostname.replace(/^www\./, "")}${path}${u.search}`;
  } catch {
    return url;
  }
}

interface BrowserToolbarProps {
  tabId: string;
  tabUrl: string;
  tabTitle: string;
}

export function BrowserToolbar({ tabId, tabUrl, tabTitle }: BrowserToolbarProps) {
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const addBookmark = useBrowserStore((s) => s.addBookmark);
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const clearRecentVisits = useBrowserStore((s) => s.clearRecentVisits);
  const isLoading = useRightPanelStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.isLoading ?? false,
  );
  const isBookmarked = bookmarks.some((b) => normalizeUrl(b.url) === normalizeUrl(tabUrl));

  const [inputValue, setInputValue] = useState(tabUrl);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const handleStop = () => {
    const wv = getWebview(tabId);
    if (wv) (wv as any).stop();
  };

  const handleBookmark = () => {
    const displayTitle = tabTitle && tabTitle !== "New Tab" ? tabTitle : inputValue;
    addBookmark(displayTitle, inputValue);
  };

  const handleClearHistory = () => {
    clearRecentVisits();
    setMenuOpen(false);
  };

  const handleClearCookies = async () => {
    await window.electronAPI.browserClearCookies();
    setMenuOpen(false);
  };

  const handleClearCache = async () => {
    await window.electronAPI.browserClearCache();
    setMenuOpen(false);
  };

  return (
    <>
      {/* Nav buttons */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Back"
        onClick={handleBack}
      >
        <ArrowLeftIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title="Forward"
        onClick={handleForward}
      >
        <ArrowRightIcon className="size-3.5" />
      </button>
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title={isLoading ? "Stop loading" : "Reload"}
        onClick={isLoading ? handleStop : handleReload}
      >
        <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
      </button>

      {/* Bookmark */}
      <button
        type="button"
        className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
        title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}
        onClick={handleBookmark}
      >
        <StarIcon className={cn("size-3.5", isBookmarked && "fill-warning text-warning")} />
      </button>

      <div className="mx-1 h-4 w-px bg-border shrink-0" />

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

      <div className="mx-1 h-4 w-px bg-border shrink-0" />

      {/* Three-dot menu */}
      <AppMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <AppMenuTrigger asChild>
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            title="More"
          >
            <EllipsisIcon className="size-3.5" />
          </button>
        </AppMenuTrigger>
        <AppMenuContent align="end" className="min-w-[8.5rem]">
          <AppMenuItem onClick={handleClearHistory}>Clear History</AppMenuItem>
          <AppMenuSeparator />
          <AppMenuItem onClick={handleClearCookies}>Clear Cookies</AppMenuItem>
          <AppMenuItem onClick={handleClearCache}>Clear Cache</AppMenuItem>
        </AppMenuContent>
      </AppMenu>
    </>
  );
}
