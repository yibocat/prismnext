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
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
} from "./settings-tokens";

export {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
  SETTINGS_TRIGGER,
} from "./settings-tokens";

interface AiTerminalSettingsFieldsProps {
  /** Hide PTY/Mirror execution mode (show in Advanced only). */
  hideExecutionMode?: boolean;
}

export function AiTerminalSettingsFields({ hideExecutionMode = true }: AiTerminalSettingsFieldsProps) {
  const { t } = useTranslation();
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");
  const aiTerminalAutoOpen = useSettingsStore((s) => s.settings.aiTerminalAutoOpen !== false);
  const aiTerminalPostExitGraceMs =
    useSettingsStore((s) => s.settings.aiTerminalPostExitGraceMs ?? 60_000);
  const aiTerminalIdleCloseMs =
    useSettingsStore((s) => s.settings.aiTerminalIdleCloseMs ?? 600_000);
  const aiTerminalCloseTabKillsProcess =
    useSettingsStore((s) => s.settings.aiTerminalCloseTabKillsProcess === true);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className={SETTINGS_CARD}>
      {!hideExecutionMode ? (
        <div className={SETTINGS_ROW}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TerminalIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.ai.execution")}</span>
            </div>
            <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.ai.executionDesc")}</p>
          </div>
          <AppSelect
            value={agentTerminalMode}
            onValueChange={(value: "mirror" | "pty") => void updateSettings({ agentTerminalMode: value })}
          >
            <AppSelectTrigger variant="wide">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="pty">{t("settings.terminalPage.ai.optPty")}</AppSelectItem>
              <AppSelectItem value="mirror">{t("settings.terminalPage.ai.optMirror")}</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </div>
      ) : null}
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.ai.openOnBash")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.ai.openOnBashDesc")}</p>
        </div>
        <AppSelect
          value={aiTerminalAutoOpen ? "auto" : "manual"}
          onValueChange={(value: "auto" | "manual") =>
            void updateSettings({ aiTerminalAutoOpen: value === "auto" })
          }
        >
          <AppSelectTrigger variant="wide">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="auto">{t("settings.terminalPage.ai.optAutoOpen")}</AppSelectItem>
            <AppSelectItem value="manual">{t("settings.terminalPage.ai.optManual")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.ai.keepTab")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.ai.keepTabDesc")}</p>
        </div>
        <AppSelect
          value={String(aiTerminalPostExitGraceMs)}
          onValueChange={(value) =>
            void updateSettings({ aiTerminalPostExitGraceMs: Number(value) })
          }
        >
          <AppSelectTrigger variant="wide">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="30000">{t("settings.terminalPage.ai.opt30s")}</AppSelectItem>
            <AppSelectItem value="60000">{t("settings.terminalPage.ai.opt1m")}</AppSelectItem>
            <AppSelectItem value="120000">{t("settings.terminalPage.ai.opt2m")}</AppSelectItem>
            <AppSelectItem value="300000">{t("settings.terminalPage.ai.opt5m")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.ai.idleCleanup")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.ai.idleCleanupDesc")}</p>
        </div>
        <AppSelect
          value={String(aiTerminalIdleCloseMs)}
          onValueChange={(value) =>
            void updateSettings({ aiTerminalIdleCloseMs: Number(value) })
          }
        >
          <AppSelectTrigger variant="wide">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="300000">{t("settings.terminalPage.ai.opt5m")}</AppSelectItem>
            <AppSelectItem value="600000">{t("settings.terminalPage.ai.opt10m")}</AppSelectItem>
            <AppSelectItem value="1800000">{t("settings.terminalPage.ai.opt30m")}</AppSelectItem>
            <AppSelectItem value="3600000">{t("settings.terminalPage.ai.opt1h")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>{t("settings.terminalPage.ai.closeCancels")}</span>
          <p className={SETTINGS_ROW_DESC}>{t("settings.terminalPage.ai.closeCancelsDesc")}</p>
        </div>
        <AppSelect
          value={aiTerminalCloseTabKillsProcess ? "kill" : "keep"}
          onValueChange={(value: "kill" | "keep") =>
            void updateSettings({ aiTerminalCloseTabKillsProcess: value === "kill" })
          }
        >
          <AppSelectTrigger variant="wide">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="keep">{t("settings.terminalPage.ai.optKeep")}</AppSelectItem>
            <AppSelectItem value="kill">{t("settings.terminalPage.ai.optCancel")}</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
    </div>
  );
}
