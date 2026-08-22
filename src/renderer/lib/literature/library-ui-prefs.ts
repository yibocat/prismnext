import type { LiteratureCollection, LiteratureLibraryView } from "@/types/electron.d";
import type {
  LiteratureSortColumn,
  LiteratureSortDirection,
} from "@/lib/literature/literature-format";
import { useSettingsStore } from "@/stores/settings-store";
import { useLiteratureStore } from "@/stores/literature-store";

export interface LiteratureUiPrefs {
  libraryView: LiteratureLibraryView;
  sortColumn: LiteratureSortColumn;
  sortDirection: LiteratureSortDirection;
  libraryTagFilter?: string | null;
}

const DEFAULT_PREFS: LiteratureUiPrefs = {
  libraryView: { kind: "all" },
  sortColumn: "year",
  sortDirection: "desc",
  libraryTagFilter: null,
};

function prefsMap(): Record<string, LiteratureUiPrefs> {
  return useSettingsStore.getState().settings.literatureUiByProject ?? {};
}

export function getLiteratureUiPrefs(projectRoot: string): LiteratureUiPrefs {
  const stored = prefsMap()[projectRoot];
  if (!stored) return DEFAULT_PREFS;
  return {
    libraryView: stored.libraryView ?? DEFAULT_PREFS.libraryView,
    sortColumn: stored.sortColumn ?? DEFAULT_PREFS.sortColumn,
    sortDirection: stored.sortDirection ?? DEFAULT_PREFS.sortDirection,
    libraryTagFilter: stored.libraryTagFilter ?? null,
  };
}

export function normalizeLibraryView(
  view: LiteratureLibraryView,
  collections: LiteratureCollection[],
): LiteratureLibraryView {
  if (view.kind !== "collection") return view;
  const exists = collections.some(
    (c) => c.id === view.collectionId || c.zotero_key === view.collectionId,
  );
  return exists ? view : { kind: "all" };
}

export async function persistLiteratureUiPrefs(
  projectRoot: string,
  patch: Partial<LiteratureUiPrefs>,
): Promise<void> {
  const current = getLiteratureUiPrefs(projectRoot);
  const next: LiteratureUiPrefs = { ...current, ...patch };
  const map = { ...prefsMap(), [projectRoot]: next };
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, literatureUiByProject: map },
  }));
  await window.electronAPI.settingsSet({ literatureUiByProject: map });
}

export function applyLiteratureUiPrefs(projectRoot: string): void {
  const prefs = getLiteratureUiPrefs(projectRoot);
  useLiteratureStore.setState({
    libraryView: prefs.libraryView,
    librarySortColumn: prefs.sortColumn,
    librarySortDirection: prefs.sortDirection,
    libraryTagFilter: prefs.libraryTagFilter ?? null,
  });
}

export function reconcileLibraryViewWithCollections(
  projectRoot: string,
  collections: LiteratureCollection[],
): void {
  const { libraryView } = useLiteratureStore.getState();
  const normalized = normalizeLibraryView(libraryView, collections);
  if (
    normalized.kind === libraryView.kind &&
    (normalized.kind !== "collection" ||
      (libraryView.kind === "collection" && normalized.collectionId === libraryView.collectionId))
  ) {
    return;
  }
  useLiteratureStore.setState({ libraryView: normalized });
  void persistLiteratureUiPrefs(projectRoot, { libraryView: normalized });
}
