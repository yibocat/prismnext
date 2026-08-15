import { useTranslation } from "react-i18next";
import { resolveTerminalExecutionSettings, toTerminalExecutionSettingsPatch } from "@shared/execution";
import { useSettingsStore } from "@/stores/settings-store";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  SETTINGS_CARD,
  SETTINGS_CATEGORY_HEADER,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

export function TerminalSettings() {
  const { t } = useTranslation();
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const resolved = resolveTerminalExecutionSettings(settings);

  const patchMonitor = (next: Parameters<typeof toTerminalExecutionSettingsPatch>[0]) => {
    void updateSettings(toTerminalExecutionSettingsPatch(next, settings));
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">{t("settings.terminalPage.title")}</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            {t("settings.terminalPage.pageDesc")}
          </p>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.terminalPage.userShell")}</p>
          <div className={SETTINGS_CARD}>
            <div className="py-3">
              <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.userShellDesc")}</p>
            </div>
          </div>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.terminalPage.jobMonitor")}</p>
          <p className="text-[length:var(--font-size-12)] text-muted-foreground mb-2">
            {t("settings.terminalPage.jobMonitorDesc")}
          </p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.openOnJob")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.openOnJobDesc")}</p>
              </div>
              <AppSelect
                value={resolved.jobMonitorAutoOpen ? "auto" : "manual"}
                onValueChange={(value: "auto" | "manual") =>
                  patchMonitor({ jobMonitorAutoOpen: value === "auto" })
                }
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="auto">{t("settings.terminalPage.optAutoOpen")}</AppSelectItem>
                  <AppSelectItem value="manual">{t("settings.terminalPage.optManual")}</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.closeAction")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.closeActionDesc")}</p>
              </div>
              <AppSelect
                value={resolved.jobMonitorCloseCancels ? "cancel" : "detach"}
                onValueChange={(value: "detach" | "cancel") =>
                  patchMonitor({ jobMonitorCloseCancels: value === "cancel" })
                }
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="detach">{t("settings.terminalPage.optKeep")}</AppSelectItem>
                  <AppSelectItem value="cancel">{t("settings.terminalPage.optCancel")}</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.keepFinished")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.keepFinishedDesc")}</p>
              </div>
              <AppSelect
                value={String(resolved.jobMonitorKeepFinishedMs)}
                onValueChange={(value) =>
                  patchMonitor({ jobMonitorKeepFinishedMs: Number(value) })
                }
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="30000">{t("settings.terminalPage.opt30s")}</AppSelectItem>
                  <AppSelectItem value="60000">{t("settings.terminalPage.opt1m")}</AppSelectItem>
                  <AppSelectItem value="120000">{t("settings.terminalPage.opt2m")}</AppSelectItem>
                  <AppSelectItem value="300000">{t("settings.terminalPage.opt5m")}</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.idleCleanup")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.idleCleanupDesc")}</p>
              </div>
              <AppSelect
                value={String(resolved.jobMonitorIdleCloseMs)}
                onValueChange={(value) =>
                  patchMonitor({ jobMonitorIdleCloseMs: Number(value) })
                }
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="300000">{t("settings.terminalPage.opt5m")}</AppSelectItem>
                  <AppSelectItem value="600000">{t("settings.terminalPage.opt10m")}</AppSelectItem>
                  <AppSelectItem value="1800000">{t("settings.terminalPage.opt30m")}</AppSelectItem>
                  <AppSelectItem value="3600000">{t("settings.terminalPage.opt1h")}</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        <div>
          <p className={SETTINGS_CATEGORY_HEADER}>{t("settings.terminalPage.lifecycle")}</p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.lifecycleChat")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.lifecycleChatDesc")}</p>
              </div>
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.lifecycleProject")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.lifecycleProjectDesc")}</p>
              </div>
            </div>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.lifecycleQuit")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.lifecycleQuitDesc")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
