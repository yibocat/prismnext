/**
 * Per-project recently opened experiments — Files-style home list.
 */
import { useSettingsStore } from "@/stores/settings-store";
import { MAX_RECENT_OPENED_FILES } from "@/styles/constants";
import { getExperimentProjectRoot } from "./experiments-project-root";

export interface RecentOpenedExperiment {
  id: string;
  name: string;
  lastOpened: number;
}

export function getRecentOpenedExperimentsForProject(
  projectRoot: string | null,
): RecentOpenedExperiment[] {
  if (!projectRoot) return [];
  const map = useSettingsStore.getState().settings.recentOpenedExperimentsByProject ?? {};
  return map[projectRoot] ?? [];
}

export async function trackRecentOpenedExperiment(id: string, name: string): Promise<void> {
  const projectRoot = getExperimentProjectRoot();
  if (!projectRoot || !id.trim()) return;

  const map = { ...(useSettingsStore.getState().settings.recentOpenedExperimentsByProject ?? {}) };
  const current = map[projectRoot] ?? [];
  const next: RecentOpenedExperiment[] = [
    { id, name: name.slice(0, 120), lastOpened: Date.now() },
    ...current.filter((e) => e.id !== id),
  ].slice(0, MAX_RECENT_OPENED_FILES);
  map[projectRoot] = next;

  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, recentOpenedExperimentsByProject: map },
  }));
  await window.electronAPI.settingsSet({ recentOpenedExperimentsByProject: map });
}

/** Keep entries that still exist in the loaded experiment list. */
export function filterRecentExperimentsForDisplay(
  entries: RecentOpenedExperiment[],
  knownIds: Set<string>,
): RecentOpenedExperiment[] {
  return entries.filter((e) => knownIds.has(e.id));
}
