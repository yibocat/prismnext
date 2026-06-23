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
import {
  AiTerminalSettingsFields,
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
  SETTINGS_TRIGGER,
} from "./ai-terminal-settings-fields";

export function TerminalSettings() {
  const agentTerminalMode = useSettingsStore((s) => s.settings.agentTerminalMode ?? "pty");
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        <div>
          <h2 className="text-[length:var(--font-dialog-title)] font-semibold">Terminal</h2>
          <p className="text-[length:var(--font-dialog-label)] text-muted-foreground mt-0.5">
            AI agent terminal lifecycle and interactive shell preferences.
          </p>
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            AI Terminal
          </p>
          <AiTerminalSettingsFields hideExecutionMode />
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Advanced
          </p>
          <div className={SETTINGS_CARD}>
            <div className={SETTINGS_ROW}>
              <div className="min-w-0">
                <span className={SETTINGS_ROW_LABEL}>Execution transport</span>
                <p className={SETTINGS_ROW_DESC}>
                  Troubleshooting only. PTY is the default production path. Mirror replays
                  output from the tool result without a live stream.
                </p>
              </div>
              <Select
                value={agentTerminalMode}
                onValueChange={(value: "mirror" | "pty") =>
                  void updateSettings({ agentTerminalMode: value })
                }
              >
                <SelectTrigger className={cn(SETTINGS_TRIGGER)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pty">PTY stream</SelectItem>
                  <SelectItem value="mirror">Mirror (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div>
          <p className="text-[length:var(--font-size-12)] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            User Terminal
          </p>
          <div className={SETTINGS_CARD}>
            <div className="py-4 px-1 flex items-start gap-3 text-muted-foreground">
              <TerminalIcon className="size-4 shrink-0 mt-0.5 opacity-60" />
              <p className={SETTINGS_ROW_DESC}>
                Shell, font size, scrollback, and default working directory settings for
                interactive terminals will appear here in a future update. Tabs are named
                after your system shell (e.g. zsh, bash, PowerShell).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
