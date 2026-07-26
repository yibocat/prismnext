import { GlobeIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import {
  SEARCH_ENGINES,
  getSearchEngine,
  isSearchEngineId,
  type SearchEngineId,
  type SearchEngine,
} from "@/lib/browser/search-engines";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
} from "@/components/ui/app-select";
import { SETTINGS_CARD, SETTINGS_ROW, SETTINGS_ROW_DESC, SETTINGS_ROW_LABEL } from "./settings-tokens";

export function BrowserSettings() {
  const { t } = useTranslation();
  const searchEngine = useSettingsStore((s) => s.settings.searchEngine);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const value: SearchEngineId = isSearchEngineId(searchEngine) ? searchEngine : SEARCH_ENGINES[0].id;
  const currentEngine: SearchEngine = getSearchEngine(value);
  /**
   * Always pass `defaultValue: fallbackName` so the display name never
   * falls back to the raw i18n key path. i18next caches its resources
   * at init time and does not pick up JSON file edits via Vite HMR, so
   * until the user fully reloads the dev server, the translation may
   * be missing. `defaultValue` is the safety net.
   */
  const engineName = (engine: SearchEngine) =>
    t(engine.nameKey, { defaultValue: engine.fallbackName });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.browserPage.title")}
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.browserPage.pageDesc")}
          </p>
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            {t("settings.browserPage.search")}
          </p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>
                  {t("settings.browserPage.defaultSearchEngine")}
                </span>
                <p className={SETTINGS_ROW_DESC}>
                  {t("settings.browserPage.defaultSearchEngineDesc")}
                </p>
              </div>
              <AppSelect
                value={value}
                onValueChange={(next) => {
                  if (isSearchEngineId(next)) {
                    void updateSettings({ searchEngine: next });
                  }
                }}
              >
                <AppSelectTrigger variant="wide">
                  <span className="line-clamp-1">
                    {engineName(currentEngine)}
                  </span>
                </AppSelectTrigger>
                <AppSelectContent>
                  {SEARCH_ENGINES.map((engine) => (
                    <AppSelectItem key={engine.id} value={engine.id}>
                      {engineName(engine)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
            <div className="py-3 px-1 flex items-start gap-3 text-muted-foreground">
              <GlobeIcon className="size-4 shrink-0 mt-0.5 opacity-60" />
              <p className={SETTINGS_ROW_DESC}>{t("settings.browserPage.urlVsSearchHint")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
