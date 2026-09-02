import { useEffect } from "react";
import { shellDesktop } from "@/lib/desktop-api/shell";
import { useSettingsStore } from "@/stores/settings-store";

/** Help → Developer → Show full prompt text (Win/Linux: Alt to show the menu bar). */
export function useAppDeveloperMenu(): void {
  useEffect(() => {
    return shellDesktop.onSetPromptInternals((enabled) => {
      const current = useSettingsStore.getState().settings.showPromptInternals === true;
      if (current === enabled) return;
      void useSettingsStore.getState().updateSettings({ showPromptInternals: enabled });
    });
  }, []);
}
