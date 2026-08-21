import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRightIcon, InfoIcon } from "lucide-react";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import { Switch } from "@/components/ui/switch";
import { openSettingsPanel } from "@/stores/settings-panel-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useWorkbenchStore } from "@/stores/workbench-store";
import {
  APP_LOCALE_PREFERENCES,
  normalizeAppLocalePreference,
  type AppLocalePreference,
} from "../../../../shared/app-locale";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

const CARD = SETTINGS_CARD;
const CATEGORY_HEADER = SETTINGS_CATEGORY_HEADER;
const ROW_LABEL = SETTINGS_ROW_LABEL;
const ROW_DESC = SETTINGS_ROW_DESC;

function localeOptionLabel(value: AppLocalePreference, t: (key: string) => string): string {
  switch (value) {
    case "en":
      return t("localeName.en");
    case "zh-CN":
      return t("localeName.zhCN");
    case "zh-HK":
      return t("localeName.zhHK");
  }
}

function PanelRow({
  title,
  description,
  openLabel,
  onOpen,
}: {
  title: string;
  description: string;
  openLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1 pr-4">
        <p className={ROW_LABEL}>{title}</p>
        <p className={ROW_DESC}>{description}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
      >
        {openLabel}
        <ChevronRightIcon className="size-3.5" />
      </button>
    </div>
  );
}

export function GeneralSettings() {
  const { t } = useTranslation();
  const appLocale = useSettingsStore((s) =>
    normalizeAppLocalePreference(s.settings.appLocale),
  );
  const desktopNotifications = useSettingsStore(
    (s) => s.settings.desktopNotifications !== false,
  );
  const trayIconEnabled = useSettingsStore((s) => s.settings.trayIconEnabled !== false);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const defaultProjectId = useWorkbenchStore((s) => s.defaultProjectId);
  const members = useWorkbenchStore((s) => s.members);
  const hydrateWorkbench = useWorkbenchStore((s) => s.hydrate);
  const setDefault = useWorkbenchStore((s) => s.setDefault);
  const setDefaultFromFolder = useWorkbenchStore((s) => s.setDefaultFromFolder);

  useEffect(() => {
    void hydrateWorkbench();
  }, [hydrateWorkbench]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">
            {t("settings.general.title")}
          </h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.general.subtitle")}
          </p>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.general.language")}</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.general.appLanguage")}</p>
                <p className={ROW_DESC}>{t("settings.general.appLanguageDesc")}</p>
              </div>
              <AppSelect
                value={appLocale}
                onValueChange={(v) => {
                  void updateSettings({ appLocale: v as AppLocalePreference });
                }}
              >
                <AppSelectTrigger className="w-44 shrink-0">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  {APP_LOCALE_PREFERENCES.map((value) => (
                    <AppSelectItem key={value} value={value}>
                      {localeOptionLabel(value, t)}
                    </AppSelectItem>
                  ))}
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.general.workbench")}</h3>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.general.defaultProject")}</p>
                <p className={ROW_DESC}>{t("settings.general.defaultProjectDesc")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {members.length > 0 ? (
                  <AppSelect
                    value={defaultProjectId}
                    onValueChange={(id) => {
                      void setDefault(id);
                    }}
                  >
                    <AppSelectTrigger className="w-52 shrink-0">
                      <AppSelectValue />
                    </AppSelectTrigger>
                    <AppSelectContent>
                      {members.map((member) => (
                        <AppSelectItem key={member.id} value={member.id}>
                          {member.displayName}
                        </AppSelectItem>
                      ))}
                    </AppSelectContent>
                  </AppSelect>
                ) : null}
                <button
                  type="button"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[length:var(--font-size-12)] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={() => {
                    void (async () => {
                      const result = await window.electronAPI.dialogOpenFolder();
                      if (result.canceled || !result.path) return;
                      await setDefaultFromFolder(result.path);
                    })();
                  }}
                >
                  {t("settings.general.defaultProjectFolder")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <h3 className={CATEGORY_HEADER + " !mb-0"}>
              {t("settings.general.notifications")}
            </h3>
            <InfoIcon className="size-3 text-muted-foreground/50" />
          </div>
          <div className={CARD}>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.general.desktopNotifications")}</p>
                <p className={ROW_DESC}>{t("settings.general.desktopNotificationsDesc")}</p>
              </div>
              <Switch
                checked={desktopNotifications}
                onCheckedChange={(v) => {
                  void updateSettings({ desktopNotifications: v });
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 pr-4">
                <p className={ROW_LABEL}>{t("settings.general.trayIcon")}</p>
                <p className={ROW_DESC}>{t("settings.general.trayIconDesc")}</p>
              </div>
              <Switch
                checked={trayIconEnabled}
                onCheckedChange={(v) => {
                  void updateSettings({ trayIconEnabled: v });
                }}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.general.shortcuts")}</h3>
          <div className={CARD}>
            <PanelRow
              title={t("settings.general.keyboardShortcuts")}
              description={t("settings.general.keyboardShortcutsDesc")}
              openLabel={t("settings.general.open")}
              onOpen={() => openSettingsPanel({ kind: "shortcuts" })}
            />
          </div>
        </div>

        <div>
          <h3 className={CATEGORY_HEADER}>{t("settings.general.logs")}</h3>
          <div className={CARD}>
            <PanelRow
              title={t("settings.general.applicationLogs")}
              description={t("settings.general.applicationLogsDesc")}
              openLabel={t("settings.general.open")}
              onOpen={() => openSettingsPanel({ kind: "logs" })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
