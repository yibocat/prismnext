import { resolveTerminalExecutionSettings } from "../../../shared/execution";
import { useSettingsStore } from "@/stores/settings-store";

export function readTerminalExecutionSettings() {
  return resolveTerminalExecutionSettings(useSettingsStore.getState().settings);
}

/** When true (default), bash tool_use opens/focuses the Job Monitor automatically. */
export function shouldAutoOpenAiTerminal(): boolean {
  return readTerminalExecutionSettings().jobMonitorAutoOpen;
}
