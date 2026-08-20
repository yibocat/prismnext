import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useBrowserStore } from "@/stores/browser-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toUrlOrSearch } from "@/lib/browser/search-engines";
import { getWebview } from "./webview-registry";
import { setComposerDragData } from "@/lib/chat/composer-drag";
import { linkLabelForUrl } from "@/lib/browser-link/normalize";
import {
  BROWSER_OMNIBOX_LIST_ID,
  BrowserOmniboxPanel,
  navigateOmniboxChoice,
  suggestionOptionId,
  useBrowserOmniboxSuggestions,
} from "./browser-omnibox";
import { Hint } from "@/components/ui/hint";
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
  PlusIcon,
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
  const { t } = useTranslation();
  const navigateBrowserTab = useRightPanelStore((s) => s.navigateBrowserTab);
  const newBrowserTab = useRightPanelStore((s) => s.newBrowserTab);
  const addBookmark = useBrowserStore((s) => s.addBookmark);
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const clearRecentVisits = useBrowserStore((s) => s.clearRecentVisits);
  const isLoading = useRightPanelStore(
    (s) => s.tabs.find((t) => t.id === tabId)?.isLoading ?? false,
  );
  const isBookmarked = bookmarks.some((b) => normalizeUrl(b.url) === normalizeUrl(tabUrl));

  const [inputValue, setInputValue] = useState(tabUrl);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<number | null>(null);
  const omniboxOpen = useBrowserStore((s) => s.omniboxOpen);
  const omniboxActiveIndex = useBrowserStore((s) => s.omniboxActiveIndex);
  const openOmnibox = useBrowserStore((s) => s.openOmnibox);
  const setOmniboxQuery = useBrowserStore((s) => s.setOmniboxQuery);
  const setOmniboxActiveIndex = useBrowserStore((s) => s.setOmniboxActiveIndex);
  const setOmniboxAnchor = useBrowserStore((s) => s.setOmniboxAnchor);
  const closeOmnibox = useBrowserStore((s) => s.closeOmnibox);
  const suggestions = useBrowserOmniboxSuggestions();

  useEffect(() => {
    setInputValue(tabUrl);
  }, [tabUrl]);

  const syncOmniboxAnchor = useCallback(() => {
    const box = barRef.current?.getBoundingClientRect();
    if (!box || box.width < 1) return;
    setOmniboxAnchor({ left: box.left, bottom: box.bottom, width: box.width });
  }, [setOmniboxAnchor]);

  useEffect(() => {
    if (!omniboxOpen) return;
    syncOmniboxAnchor();
    const onShift = () => syncOmniboxAnchor();
    window.addEventListener("resize", onShift);
    window.addEventListener("scroll", onShift, true);
    return () => {
      window.removeEventListener("resize", onShift);
      window.removeEventListener("scroll", onShift, true);
    };
  }, [omniboxOpen, syncOmniboxAnchor]);

  useEffect(() => {
    return () => {
      if (blurTimerRef.current != null) window.clearTimeout(blurTimerRef.current);
    };
  }, []);

  const navigate = useCallback(
    (targetUrl: string) => {
      const s = targetUrl.trim();
      if (!s) return;
      const { searchEngine } = useSettingsStore.getState().settings;
      const finalUrl = toUrlOrSearch(searchEngine, s);
      setInputValue(finalUrl);
      closeOmnibox();
      navigateBrowserTab(tabId, finalUrl);
      // navigateBrowserTab already drives the webview via store; no second
      // loadURL() — that would cause a GUEST_VIEW_MANAGER_CALL ERR_ABORTED
      // race in the console when the second navigation cancels the first.
    },
    [tabId, navigateBrowserTab, closeOmnibox],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.nativeEvent.isComposing || e.key === "Process") return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!omniboxOpen) {
          openOmnibox(inputValue === tabUrl ? "" : inputValue);
          return;
        }
        if (suggestions.length === 0) return;
        setOmniboxActiveIndex(Math.min(omniboxActiveIndex + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!omniboxOpen || suggestions.length === 0) return;
        setOmniboxActiveIndex(Math.max(omniboxActiveIndex - 1, -1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeOmnibox();
        setInputValue(tabUrl);
        inputRef.current?.blur();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (omniboxOpen && omniboxActiveIndex >= 0 && suggestions[omniboxActiveIndex]) {
          navigateOmniboxChoice(tabId, inputValue, suggestions, omniboxActiveIndex);
          setInputValue(suggestions[omniboxActiveIndex].url);
          return;
        }
        navigate(inputValue);
      }
    },
    [
      closeOmnibox,
      inputValue,
      navigate,
      omniboxActiveIndex,
      omniboxOpen,
      openOmnibox,
      setOmniboxActiveIndex,
      suggestions,
      tabId,
      tabUrl,
    ],
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
    useRightPanelStore.getState().reloadBrowserTab(tabId);
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
      <Hint label={t("modes.browser.back")}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={handleBack}
        >
          <ArrowLeftIcon className="size-3.5" />
        </button>
      </Hint>
      <Hint label={t("modes.browser.forward")}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={handleForward}
        >
          <ArrowRightIcon className="size-3.5" />
        </button>
      </Hint>
      <Hint label={isLoading ? t("modes.browser.stop") : t("modes.browser.reload")}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={isLoading ? handleStop : handleReload}
        >
          <RefreshCwIcon className={cn("size-3.5", isLoading && "animate-spin")} />
        </button>
      </Hint>

      {/* Bookmark */}
      <Hint label={t("modes.browser.bookmark")}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={handleBookmark}
        >
          <StarIcon className={cn("size-3.5", isBookmarked && "fill-warning text-warning")} />
        </button>
      </Hint>

      <div className="mx-1 h-4 w-px bg-border shrink-0" />

      {/* URL bar */}
      <div
        ref={barRef}
        className="flex-1 flex items-center gap-1.5 h-6 rounded bg-muted/50 px-2 min-w-0"
        draggable={Boolean(tabUrl?.trim())}
        onDragStart={(e) => {
          const url = tabUrl.trim();
          if (!url) {
            e.preventDefault();
            return;
          }
          setComposerDragData(e.dataTransfer, [
            { v: 1, kind: "link", url, label: tabTitle || linkLabelForUrl(url) },
          ]);
        }}
      >
        <GlobeIcon className="size-3 shrink-0 text-muted-foreground/60" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={omniboxOpen}
          aria-controls={BROWSER_OMNIBOX_LIST_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            omniboxOpen && suggestions[omniboxActiveIndex]
              ? suggestionOptionId(suggestions[omniboxActiveIndex].id)
              : undefined
          }
          value={inputValue}
          onChange={(e) => {
            const next = e.target.value;
            setInputValue(next);
            syncOmniboxAnchor();
            setOmniboxQuery(next);
          }}
          onFocus={(e) => {
            if (blurTimerRef.current != null) {
              window.clearTimeout(blurTimerRef.current);
              blurTimerRef.current = null;
            }
            e.currentTarget.select();
            syncOmniboxAnchor();
            openOmnibox("");
          }}
          onBlur={() => {
            blurTimerRef.current = window.setTimeout(() => {
              if (document.activeElement === inputRef.current) return;
              closeOmnibox();
            }, 120);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("modes.browser.urlPlaceholder")}
          className="flex-1 bg-transparent text-[length:var(--font-size-12)] text-foreground placeholder:text-muted-foreground/50 outline-none min-w-0"
        />
      </div>

      <div className="mx-1 h-4 w-px bg-border shrink-0" />

      <Hint label={t("modes.browser.newTab", { defaultValue: "New Tab" })}>
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
          onClick={() => newBrowserTab()}
        >
          <PlusIcon className="size-3.5" />
        </button>
      </Hint>

      {/* Three-dot menu */}
      <AppMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <Hint label={t("common.more")}>
          <AppMenuTrigger asChild>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          </AppMenuTrigger>
        </Hint>
        <AppMenuContent align="end" className="min-w-[8.5rem]">
          <AppMenuItem onClick={handleClearHistory}>{t("modes.browser.clearHistory")}</AppMenuItem>
          <AppMenuSeparator />
          <AppMenuItem onClick={handleClearCookies}>{t("modes.browser.clearCookies")}</AppMenuItem>
          <AppMenuItem onClick={handleClearCache}>{t("modes.browser.clearCache")}</AppMenuItem>
        </AppMenuContent>
      </AppMenu>
      <BrowserOmniboxPanel tabId={tabId} />
    </>
  );
}
