/**
 * Per-project recently opened experiments — Files-style home list.
 */
import { MAX_RECENT_OPENED_FILES } from "@/styles/constants";

export interface RecentOpenedExperiment {
  id: string;
  name: string;
  lastOpened: number;
}

export function getRecentOpenedExperimentsForProject(
  projectRoot: string | null,
  map: Record<string, RecentOpenedExperiment[]> | undefined,
): RecentOpenedExperiment[] {
  if (!projectRoot) return [];
  return map?.[projectRoot] ?? [];
}

export function nextRecentOpenedExperimentsByProject(
  map: Record<string, RecentOpenedExperiment[]> | undefined,
  projectRoot: string,
  id: string,
  name: string,
  now = Date.now(),
): Record<string, RecentOpenedExperiment[]> {
  const current = map?.[projectRoot] ?? [];
  const next: RecentOpenedExperiment[] = [
    { id, name: name.slice(0, 120), lastOpened: now },
    ...current.filter((e) => e.id !== id),
  ].slice(0, MAX_RECENT_OPENED_FILES);
  return { ...map, [projectRoot]: next };
}

/** Keep entries that still exist in the loaded experiment list. */
export function filterRecentExperimentsForDisplay(
  entries: RecentOpenedExperiment[],
  knownIds: Set<string>,
): RecentOpenedExperiment[] {
  return entries.filter((e) => knownIds.has(e.id));
}
