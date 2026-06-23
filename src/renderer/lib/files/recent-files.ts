import { MAX_RECENT_OPENED_FILES } from "@/styles/constants";
import { useSettingsStore } from "@/stores/settings-store";

export interface RecentOpenedFile {
  id: string;
  name: string;
  lastOpened: number;
}

export async function trackRecentOpenedFile(id: string, name: string): Promise<void> {
  const current = useSettingsStore.getState().settings.recentOpenedFiles ?? [];
  const next: RecentOpenedFile[] = [
    { id, name, lastOpened: Date.now() },
    ...current.filter((e) => e.id !== id),
  ].slice(0, MAX_RECENT_OPENED_FILES);

  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, recentOpenedFiles: next },
  }));
  await window.electronAPI.settingsSet({ recentOpenedFiles: next });
}
