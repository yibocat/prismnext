import { TerminalIcon } from "lucide-react";
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
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");
  const aiTerminalAutoOpen = useSettingsStore((s) => s.settings.aiTerminalAutoOpen !== false);
  const aiTerminalPostExitGraceMs =
    useSettingsStore((s) => s.settings.aiTerminalPostExitGraceMs ?? 60_000);
  const aiTerminalIdleCloseMs =
    useSettingsStore((s) => s.settings.aiTerminalIdleCloseMs ?? 600_000);
  const aiTerminalCloseTabKillsProcess =
    useSettingsStore((s) => s.settings.aiTerminalCloseTabKillsProcess === true);
  const aiTerminalShowSessionIndicator =
    useSettingsStore((s) => s.settings.aiTerminalShowSessionIndicator !== false);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className={SETTINGS_CARD}>
      {!hideExecutionMode ? (
        <div className={SETTINGS_ROW}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TerminalIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span className={SETTINGS_ROW_LABEL}>Agent terminal execution</span>
            </div>
            <p className={SETTINGS_ROW_DESC}>
              PTY stream shows live output while commands run. Mirror waits for completion
              then replays the log. In Ask and Auto permission modes, shell always uses PTY
              so commands run only after you Allow in the permission gate.
            </p>
          </div>
          <AppSelect
            value={agentTerminalMode}
            onValueChange={(value: "mirror" | "pty") => void updateSettings({ agentTerminalMode: value })}
          >
            <AppSelectTrigger variant="wide">
              <AppSelectValue />
            </AppSelectTrigger>
            <AppSelectContent>
              <AppSelectItem value="pty">PTY stream (default)</AppSelectItem>
              <AppSelectItem value="mirror">Mirror (fallback)</AppSelectItem>
            </AppSelectContent>
          </AppSelect>
        </div>
      ) : null}
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Open AI terminal on bash</span>
          <p className={SETTINGS_ROW_DESC}>
            Auto-focus the ✨ AI terminal tab when the agent runs bash. Output is always
            saved to the session log either way.
          </p>
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
            <AppSelectItem value="auto">Auto open</AppSelectItem>
            <AppSelectItem value="manual">Manual only</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Keep tab after command exits</span>
          <p className={SETTINGS_ROW_DESC}>
            Minimum time to keep the ✨ AI terminal tab open after a command finishes
            (PTY has already exited). Idle cleanup applies after this grace period.
          </p>
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
            <AppSelectItem value="30000">30 seconds</AppSelectItem>
            <AppSelectItem value="60000">1 minute</AppSelectItem>
            <AppSelectItem value="120000">2 minutes</AppSelectItem>
            <AppSelectItem value="300000">5 minutes</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Idle tab cleanup</span>
          <p className={SETTINGS_ROW_DESC}>
            Auto-close an idle ✨ AI terminal tab when you have not viewed that session
            for this long (after the post-exit grace).
          </p>
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
            <AppSelectItem value="300000">5 minutes</AppSelectItem>
            <AppSelectItem value="600000">10 minutes</AppSelectItem>
            <AppSelectItem value="1800000">30 minutes</AppSelectItem>
            <AppSelectItem value="3600000">1 hour</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Close tab cancels command</span>
          <p className={SETTINGS_ROW_DESC}>
            When enabled, closing a ✨ AI terminal tab while bash is running also cancels
            the command. Default: close the view only; the command keeps running.
          </p>
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
            <AppSelectItem value="keep">Keep running (default)</AppSelectItem>
            <AppSelectItem value="kill">Cancel command</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Session title terminal status</span>
          <p className={SETTINGS_ROW_DESC}>
            Show AI terminal running / idle status in the session title hover card.
          </p>
        </div>
        <AppSelect
          value={aiTerminalShowSessionIndicator ? "show" : "hide"}
          onValueChange={(value: "show" | "hide") =>
            void updateSettings({ aiTerminalShowSessionIndicator: value === "show" })
          }
        >
          <AppSelectTrigger variant="wide">
            <AppSelectValue />
          </AppSelectTrigger>
          <AppSelectContent>
            <AppSelectItem value="show">Show</AppSelectItem>
            <AppSelectItem value="hide">Hide</AppSelectItem>
          </AppSelectContent>
        </AppSelect>
      </div>
    </div>
  );
}
