import { useSettingsStore } from "@/stores/settings-store";

/** When true (default), bash tool_use opens/focuses the AI terminal tab automatically. */
export function shouldAutoOpenAiTerminal(): boolean {
  return useSettingsStore.getState().settings.aiTerminalAutoOpen !== false;
}
