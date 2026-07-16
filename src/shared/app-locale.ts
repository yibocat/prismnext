/** Persisted UI language preference (no follow-system). */
export type AppLocalePreference = "en" | "zh-CN" | "zh-HK";

/** Concrete catalogs we ship. */
export type ResolvedAppLocale = AppLocalePreference;

/** Display order in Settings — English first. */
export const APP_LOCALE_PREFERENCES: AppLocalePreference[] = [
  "en",
  "zh-CN",
  "zh-HK",
];

export const RESOLVED_APP_LOCALES: ResolvedAppLocale[] = [
  "en",
  "zh-CN",
  "zh-HK",
];

/** Coerce stored / unknown values. Legacy `"system"` → `"en"`. */
export function normalizeAppLocalePreference(
  value: unknown,
): AppLocalePreference {
  if (value === "en" || value === "zh-CN" || value === "zh-HK") {
    return value;
  }
  return "en";
}

/** Preference is always an explicit catalog id. */
export function resolveAppLocale(
  preference: AppLocalePreference | undefined,
  _systemLocale?: string,
): ResolvedAppLocale {
  return normalizeAppLocalePreference(preference);
}
