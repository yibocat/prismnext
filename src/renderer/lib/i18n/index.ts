import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  normalizeAppLocalePreference,
  resolveAppLocale,
  type AppLocalePreference,
  type ResolvedAppLocale,
} from "../../../shared/app-locale";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhHK from "./locales/zh-HK.json";

const resources = {
  en: { translation: en },
  "zh-CN": { translation: zhCN },
  "zh-HK": { translation: zhHK },
} as const;

let initialized = false;

export function initI18n(initialResolved: ResolvedAppLocale = "en"): typeof i18n {
  if (initialized) return i18n;
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialResolved,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    // Avoid suspense on first paint before settings load.
    react: { useSuspense: false },
  });
  initialized = true;
  return i18n;
}

export function systemLocaleHint(): string {
  if (typeof navigator !== "undefined" && navigator.language) {
    return navigator.language;
  }
  return "en";
}

function documentLang(resolved: ResolvedAppLocale): string {
  if (resolved === "zh-CN") return "zh-CN";
  if (resolved === "zh-HK") return "zh-HK";
  return "en";
}

/** Apply preference → change i18n language. Returns resolved catalog id. */
export async function applyAppLocalePreference(
  preference: AppLocalePreference | undefined,
): Promise<ResolvedAppLocale> {
  initI18n();
  const resolved = resolveAppLocale(
    normalizeAppLocalePreference(preference),
    systemLocaleHint(),
  );
  if (i18n.language !== resolved) {
    await i18n.changeLanguage(resolved);
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = documentLang(resolved);
  }
  return resolved;
}

export { i18n };
