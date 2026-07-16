import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { applyAppLocalePreference } from "./index";
import type { AppLocalePreference } from "../../../shared/app-locale";

/** Keep react-i18next in sync with persisted `appLocale`. */
export function LocaleSync() {
  const loaded = useSettingsStore((s) => s.loaded);
  const appLocale = useSettingsStore((s) => s.settings.appLocale);

  useEffect(() => {
    if (!loaded) return;
    void applyAppLocalePreference(appLocale as AppLocalePreference | undefined);
  }, [loaded, appLocale]);

  return null;
}
