import { useLayoutStore } from "@/stores/layout-store";
import { useSettingsStore } from "@/stores/settings-store";
import { settingsDesktop } from "@/lib/desktop-api/settings";

export function getArchivedSessionIdsForProject(projectRoot: string | null): string[] {
  if (!projectRoot) return [];
  const map = useSettingsStore.getState().settings.archivedSessionIdsByProject ?? {};
  return map[projectRoot] ?? [];
}

export function getPinnedSessionIdsForProject(projectRoot: string | null): string[] {
  if (!projectRoot) return [];
  const map = useSettingsStore.getState().settings.pinnedSessionIdsByProject ?? {};
  return map[projectRoot] ?? [];
}

async function persistSessionUiPrefs(
  projectRoot: string,
  patch: {
    archivedSessionIds?: string[];
    pinnedSessionIds?: string[];
  },
): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const nextPatch: Record<string, Record<string, string[]>> = {};

  if (patch.archivedSessionIds !== undefined) {
    const map = { ...(settings.archivedSessionIdsByProject ?? {}) };
    map[projectRoot] = patch.archivedSessionIds;
    nextPatch.archivedSessionIdsByProject = map;
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, archivedSessionIdsByProject: map },
    }));
  }

  if (patch.pinnedSessionIds !== undefined) {
    const map = { ...(settings.pinnedSessionIdsByProject ?? {}) };
    map[projectRoot] = patch.pinnedSessionIds;
    nextPatch.pinnedSessionIdsByProject = map;
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, pinnedSessionIdsByProject: map },
    }));
  }

  await settingsDesktop.settingsSet(nextPatch);
}

export function loadSessionUiPrefsIntoLayout(projectRoot: string): void {
  useLayoutStore.setState({
    archivedSessionIds: getArchivedSessionIdsForProject(projectRoot),
    pinnedSessionIds: getPinnedSessionIdsForProject(projectRoot),
    showArchived: false,
  });
}

/** Union pin/archive ids across workbench members so grouped lists stay complete. */
export function loadWorkbenchSessionUiPrefs(memberPaths: readonly string[]): void {
  const pinned = new Set<string>();
  const archived = new Set<string>();
  for (const path of memberPaths) {
    for (const id of getPinnedSessionIdsForProject(path)) pinned.add(id);
    for (const id of getArchivedSessionIdsForProject(path)) archived.add(id);
  }
  useLayoutStore.setState({
    archivedSessionIds: [...archived],
    pinnedSessionIds: [...pinned],
    showArchived: false,
  });
}

export async function toggleArchiveSessionForProject(
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  useLayoutStore.getState().toggleArchiveSession(sessionId);
  await persistSessionUiPrefs(projectRoot, {
    archivedSessionIds: useLayoutStore.getState().archivedSessionIds,
  });
}

export async function togglePinSessionForProject(
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  useLayoutStore.getState().togglePinSession(sessionId);
  await persistSessionUiPrefs(projectRoot, {
    pinnedSessionIds: useLayoutStore.getState().pinnedSessionIds,
  });
}
