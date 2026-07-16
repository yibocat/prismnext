import { TerminalIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings-store";
import {
  AppSelect,
  AppSelectContent,
  AppSelectItem,
  AppSelectTrigger,
  AppSelectValue,
} from "@/components/ui/app-select";
import {
  AiTerminalSettingsFields,
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./ai-terminal-settings-fields";

export function TerminalSettings() {
  const { t } = useTranslation();
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");
  const updateSettings = useSettingsStore((s) => s.updateSettings);

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
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            {t("settings.terminalPage.aiTerminal")}
          </p>
          <AiTerminalSettingsFields hideExecutionMode />
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            {t("settings.terminalPage.advanced")}
          </p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.advancedExecution")}</span>
                <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.advancedExecutionDesc")}</p>
              </div>
              <AppSelect
                value={agentTerminalMode}
                onValueChange={(value: "mirror" | "pty") =>
                  void updateSettings({ agentTerminalMode: value })
                }
              >
                <AppSelectTrigger variant="wide">
                  <AppSelectValue />
                </AppSelectTrigger>
                <AppSelectContent>
                  <AppSelectItem value="pty">{t("settings.terminalPage.optPtyShort")}</AppSelectItem>
                  <AppSelectItem value="mirror">{t("settings.terminalPage.ai.optMirror")}</AppSelectItem>
                </AppSelectContent>
              </AppSelect>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            {t("settings.terminalPage.userTerminal")}
          </p>
          <div className={SETTINGS_CARD}>
            <div className="py-4 px-1 flex items-start gap-3 text-muted-foreground">
              <TerminalIcon className="size-4 shrink-0 mt-0.5 opacity-60" />
              <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.userPlaceholder")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
