import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { GlobeIcon, SearchIcon, StarIcon } from "lucide-react";
import { useBrowserStore } from "@/stores/browser-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getSearchEngine, isSearchEngineId } from "@/lib/browser/search-engines";
import {
  OMNIBOX_PANEL_GAP_PX,
  OMNIBOX_PANEL_MAX_PX,
  matchOmniboxSuggestions,
  pickOmniboxNavigation,
  type OmniboxSuggestion,
} from "@/lib/browser/omnibox";
import { navigateBrowserUrl } from "@/lib/browser-link";
import { appPopoverListClass } from "@/components/ui/app-popover";
import { cn } from "@/lib/utils";
import { BrowserFavicon } from "./browser-favicon";

export const BROWSER_OMNIBOX_LIST_ID = "browser-omnibox-list";

export function useBrowserOmniboxSuggestions(): OmniboxSuggestion[] {
  const query = useBrowserStore((s) => s.omniboxQuery);
  const bookmarks = useBrowserStore((s) => s.bookmarks);
  const recentVisits = useBrowserStore((s) => s.recentVisits);
  const searchEngine = useSettingsStore((s) => s.settings.searchEngine);

  return useMemo(
    () =>
      matchOmniboxSuggestions({
        query,
        bookmarks,
        recentVisits,
        searchEngineId: isSearchEngineId(searchEngine) ? searchEngine : undefined,
      }),
    [query, bookmarks, recentVisits, searchEngine],
  );
}

export function suggestionOptionId(id: string): string {
  return `browser-omnibox-option-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

export function navigateOmniboxChoice(
  tabId: string,
  query: string,
  suggestions: OmniboxSuggestion[],
  activeIndex: number,
): void {
  const target = pickOmniboxNavigation(query, suggestions, activeIndex);
  if (!target) return;
  navigateBrowserUrl(tabId, target);
  useBrowserStore.getState().closeOmnibox();
}

function SuggestionGlyph({ suggestion }: { suggestion: OmniboxSuggestion }) {
  if (suggestion.kind === "search") {
    return <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (suggestion.kind === "bookmark") {
    return <StarIcon className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (suggestion.kind === "history") {
    return <BrowserFavicon url={suggestion.url} className="size-3.5" />;
  }
  return <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

export function BrowserOmniboxPanel({ tabId }: { tabId: string }) {
  const { t } = useTranslation();
  const open = useBrowserStore((s) => s.omniboxOpen);
  const query = useBrowserStore((s) => s.omniboxQuery);
  const activeIndex = useBrowserStore((s) => s.omniboxActiveIndex);
  const anchor = useBrowserStore((s) => s.omniboxAnchor);
  const setOmniboxActiveIndex = useBrowserStore((s) => s.setOmniboxActiveIndex);
  const searchEngine = useSettingsStore((s) => s.settings.searchEngine);
  const suggestions = useBrowserOmniboxSuggestions();

  if (!open || !anchor || suggestions.length === 0 || typeof document === "undefined") return null;

  const engine = getSearchEngine(isSearchEngineId(searchEngine) ? searchEngine : "duckduckgo");
  const engineName = t(engine.nameKey, { defaultValue: engine.fallbackName });

  return createPortal(
    <ul
      id={BROWSER_OMNIBOX_LIST_ID}
      role="listbox"
      className={cn(appPopoverListClass, "fixed z-50 max-h-64 overflow-y-auto p-0")}
      style={{
        top: anchor.bottom + OMNIBOX_PANEL_GAP_PX,
        left: anchor.left,
        width: anchor.width,
        maxHeight: OMNIBOX_PANEL_MAX_PX,
      }}
    >
      {suggestions.map((suggestion, index) => {
        const selected = index === activeIndex;
        const title =
          suggestion.kind === "search"
            ? t("modes.browser.searchFor", {
                engine: engineName,
                query: suggestion.title,
              })
            : suggestion.title;
        return (
          <li key={suggestion.id} role="presentation">
            <button
              type="button"
              id={suggestionOptionId(suggestion.id)}
              role="option"
              aria-selected={selected}
              className={cn(
                "flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors",
                selected ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setOmniboxActiveIndex(index)}
              onClick={() => navigateOmniboxChoice(tabId, query, suggestions, index)}
            >
              <span className="mt-0.5">
                <SuggestionGlyph suggestion={suggestion} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--font-size-12)] text-foreground">
                  {title}
                </span>
                {suggestion.subtitle ? (
                  <span className="block truncate text-[length:var(--font-hint)] text-muted-foreground">
                    {suggestion.subtitle}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>,
    document.body,
  );
}
