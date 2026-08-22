import { MAX_RECENT_OPENED_FILES } from "@/styles/constants";
import { useSettingsStore } from "@/stores/settings-store";
import { settingsDesktop } from "@/lib/desktop-api/settings";
import { useDocumentStore } from "@/stores/document-store";
import { isExternalFileId } from "./external-file";

export interface RecentOpenedFile {
  id: string;
  name: string;
  lastOpened: number;
}

/** Per-project recent list — never read the legacy global `recentOpenedFiles`. */
export function getRecentOpenedFilesForProject(projectRoot: string | null): RecentOpenedFile[] {
  if (!projectRoot) return [];
  const map = useSettingsStore.getState().settings.recentOpenedFilesByProject ?? {};
  return map[projectRoot] ?? [];
}

export async function trackRecentOpenedFile(id: string, name: string): Promise<void> {
  const projectRoot = useDocumentStore.getState().projectRoot;
  if (!projectRoot) return;

  const map = { ...(useSettingsStore.getState().settings.recentOpenedFilesByProject ?? {}) };
  const current = map[projectRoot] ?? [];
  const next: RecentOpenedFile[] = [
    { id, name, lastOpened: Date.now() },
    ...current.filter((e) => e.id !== id),
  ].slice(0, MAX_RECENT_OPENED_FILES);
  map[projectRoot] = next;

  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, recentOpenedFilesByProject: map },
  }));
  await settingsDesktop.settingsSet({ recentOpenedFilesByProject: map });
}

export function getProjectLastActiveFileId(projectRoot: string | null): string | null {
  if (!projectRoot) return null;
  const map = useSettingsStore.getState().settings.lastActiveFileIdByProject ?? {};
  return map[projectRoot] ?? null;
}

export async function setProjectLastActiveFileId(
  projectRoot: string,
  fileId: string | null,
): Promise<void> {
  const map = { ...(useSettingsStore.getState().settings.lastActiveFileIdByProject ?? {}) };
  map[projectRoot] = fileId;
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, lastActiveFileIdByProject: map },
  }));
  await settingsDesktop.settingsSet({ lastActiveFileIdByProject: map });
}

/** Recent entries safe to show in the current project (no cross-project leakage). */
export function filterRecentForDisplay(
  entries: RecentOpenedFile[],
  fileMetadata: Map<string, unknown>,
  projectRoot: string | null,
): RecentOpenedFile[] {
  if (!projectRoot) return [];
  return entries.filter((e) => {
    if (isExternalFileId(e.id)) {
      // External paths are global — only show if under current project root.
      const abs = e.id.slice("__external__:".length);
      return abs.startsWith(projectRoot);
    }
    return fileMetadata.has(e.id);
  });
}
