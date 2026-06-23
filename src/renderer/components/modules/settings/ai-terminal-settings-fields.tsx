import { TerminalIcon } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const SETTINGS_CARD = "rounded-lg border border-border px-4 divide-y divide-border";
export const SETTINGS_ROW = "flex items-center justify-between gap-3 py-2.5";
export const SETTINGS_ROW_LABEL = "text-[length:var(--font-size-13)] font-medium";
export const SETTINGS_ROW_DESC = "text-[length:var(--font-size-12)] text-muted-foreground mt-0.5";
export const SETTINGS_TRIGGER =
  "!h-7 !px-2 !py-0 !text-[length:var(--font-size-12)] bg-background [&_svg]:!size-3 min-w-[9rem]";

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
              then replays the log — a fallback if PTY has issues.
            </p>
          </div>
          <Select
            value={agentTerminalMode}
            onValueChange={(value: "mirror" | "pty") => void updateSettings({ agentTerminalMode: value })}
          >
            <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pty">PTY stream (default)</SelectItem>
              <SelectItem value="mirror">Mirror (fallback)</SelectItem>
            </SelectContent>
          </Select>
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
        <Select
          value={aiTerminalAutoOpen ? "auto" : "manual"}
          onValueChange={(value: "auto" | "manual") =>
            void updateSettings({ aiTerminalAutoOpen: value === "auto" })
          }
        >
          <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto open</SelectItem>
            <SelectItem value="manual">Manual only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Keep tab after command exits</span>
          <p className={SETTINGS_ROW_DESC}>
            Minimum time to keep the ✨ AI terminal tab open after a command finishes
            (PTY has already exited). Idle cleanup applies after this grace period.
          </p>
        </div>
        <Select
          value={String(aiTerminalPostExitGraceMs)}
          onValueChange={(value) =>
            void updateSettings({ aiTerminalPostExitGraceMs: Number(value) })
          }
        >
          <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30000">30 seconds</SelectItem>
            <SelectItem value="60000">1 minute</SelectItem>
            <SelectItem value="120000">2 minutes</SelectItem>
            <SelectItem value="300000">5 minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Idle tab cleanup</span>
          <p className={SETTINGS_ROW_DESC}>
            Auto-close an idle ✨ AI terminal tab when you have not viewed that session
            for this long (after the post-exit grace).
          </p>
        </div>
        <Select
          value={String(aiTerminalIdleCloseMs)}
          onValueChange={(value) =>
            void updateSettings({ aiTerminalIdleCloseMs: Number(value) })
          }
        >
          <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="300000">5 minutes</SelectItem>
            <SelectItem value="600000">10 minutes</SelectItem>
            <SelectItem value="1800000">30 minutes</SelectItem>
            <SelectItem value="3600000">1 hour</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Close tab cancels command</span>
          <p className={SETTINGS_ROW_DESC}>
            When enabled, closing a ✨ AI terminal tab while bash is running also cancels
            the command. Default: close the view only; the command keeps running.
          </p>
        </div>
        <Select
          value={aiTerminalCloseTabKillsProcess ? "kill" : "keep"}
          onValueChange={(value: "kill" | "keep") =>
            void updateSettings({ aiTerminalCloseTabKillsProcess: value === "kill" })
          }
        >
          <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keep">Keep running (default)</SelectItem>
            <SelectItem value="kill">Cancel command</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className={SETTINGS_ROW}>
        <div className="min-w-0">
          <span className={SETTINGS_ROW_LABEL}>Session title terminal status</span>
          <p className={SETTINGS_ROW_DESC}>
            Show AI terminal running / idle status in the session title hover card.
          </p>
        </div>
        <Select
          value={aiTerminalShowSessionIndicator ? "show" : "hide"}
          onValueChange={(value: "show" | "hide") =>
            void updateSettings({ aiTerminalShowSessionIndicator: value === "show" })
          }
        >
          <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="show">Show</SelectItem>
            <SelectItem value="hide">Hide</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
