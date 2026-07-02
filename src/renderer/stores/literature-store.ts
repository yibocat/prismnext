import { create } from "zustand";
import { toast } from "sonner";
import type {
  LiteratureAnnotation,
  LiteratureCollection,
  LiteratureLibraryView,
  LiteraturePaper,
  ZoteroStatus,
} from "@/types/electron.d";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { useCitationStagingStore } from "@/stores/citation-staging-store";
import { extractIdsFromPdf } from "@/lib/literature/extract-doi";
import { useWorkspaceConfigStore } from "@/stores/workspace-config-store";
import { resolveNotebookDir } from "@/types/workspace";
import {
  paperPatchFromNote,
  patchNoteLinkFrontmatter,
  persistNoteContent,
} from "@/lib/literature/recover-paper-from-note";
import {
  applyLiteratureUiPrefs,
  persistLiteratureUiPrefs,
  reconcileLibraryViewWithCollections,
} from "@/lib/literature/library-ui-prefs";
import { collectProjectTags } from "@/lib/literature/paper-tag-utils";
import { paperTagKey } from "../../shared/paper-tags";
import { formatPdfDownloadFailure } from "../../shared/pdf-download-messages";
import { useDocumentStore } from "@/stores/document-store";
import type {
  LiteratureSortColumn,
  LiteratureSortDirection,
} from "@/modes/literature-mode/literature-format";

export type LiteraturePaperPatch = Partial<
  Pick<
    LiteraturePaper,
    | "title"
    | "bibkey"
    | "authors"
    | "year"
    | "abstract"
    | "doi"
    | "arxiv_id"
    | "venue"
    | "type"
    | "isbn"
    | "tags"
  >
>;

interface LiteratureState {
  papers: LiteraturePaper[];
  selectedPaperId: string | null;
  checkedPaperIds: string[];
  searchQuery: string;
  searchResults: LiteraturePaper[] | null;
  loading: boolean;
  error: string | null;
  libraryView: LiteratureLibraryView;
  librarySortColumn: LiteratureSortColumn;
  librarySortDirection: LiteratureSortDirection;
  /** Filter library list by user tag (null = all). */
  libraryTagFilter: string | null;
  /** Sub-tab inside Literature mode: library list vs session citations. */
  librarySubview: "library" | "session-citations";
  /** Set by chat [n] click — consumed by LiteratureContent to scroll/highlight a row. */
  pendingCitationJumpRefId: number | null;
  collections: LiteratureCollection[];
  viewPaperIds: string[] | null;
  zoteroStatus: ZoteroStatus | null;
  boundCollectionId: string | null;
  boundCollectionName: string | null;
  lastZoteroSyncAt: number | null;
  pullingFromZotero: boolean;
  collectionWritePending: boolean;
  pdfCacheStatus: Record<string, { cached: boolean; stale: boolean }>;
  bbtBannerDismissed: boolean;
  /** Session guard — auto Zotero pull once per project root (manual Refresh still pulls). */
  zoteroAutoPullDoneForRoot: string | null;
  /** Latest PDF highlight excerpt in the reader — for Add to Chat. */
  readerExcerpt: {
    paperId: string;
    bibkey: string;
    title: string;
    page: number;
    quotedText: string;
  } | null;
  /** Background PDF imports in flight (toolbar indicator only). */
  pdfImportBusyCount: number;
  /** PDFs waiting in the import queue (not yet started). */
  pdfImportQueuedCount: number;
  /** Per-paper PDF download progress (catalog / arXiv fetch). */
  pdfDownloadProgress: Record<
    string,
    {
      phase: "resolving" | "downloading" | "done";
      receivedBytes?: number;
      totalBytes?: number | null;
    }
  >;
  setPdfDownloadProgress: (payload: {
    paperId: string;
    phase: "resolving" | "downloading" | "caching" | "reading" | "opening" | "done";
    receivedBytes?: number;
    totalBytes?: number | null;
  }) => void;
  setReaderExcerpt: (
    excerpt: LiteratureState["readerExcerpt"],
  ) => void;

  dismissBbtBanner: () => void;

  probeZotero: () => Promise<ZoteroStatus>;
  loadProjectBinding: (projectRoot: string) => Promise<void>;
  /** Load binding; auto-pull from Zotero once per session when bound, else refresh local list. */
  bootstrapLiterature: (projectRoot: string) => Promise<void>;
  setBoundCollection: (
    projectRoot: string,
    collectionId: string | null,
    collectionName?: string | null,
  ) => Promise<void>;
  pullFromZotero: (projectRoot: string, options?: { silent?: boolean }) => Promise<void>;
  pullZoteroCollections: (projectRoot: string) => Promise<void>;

  setLibraryView: (view: LiteratureLibraryView) => void;
  setLibrarySort: (column: LiteratureSortColumn, direction: LiteratureSortDirection) => void;
  setLibraryTagFilter: (projectRoot: string, tag: string | null) => Promise<void>;
  setLibrarySubview: (view: "library" | "session-citations") => void;
  setPendingCitationJump: (refId: number | null) => void;
  clearPendingCitationJump: () => void;
  refreshCollections: (projectRoot: string) => Promise<void>;
  loadViewPaperIds: (projectRoot: string) => Promise<void>;
  createCollection: (projectRoot: string, name: string, parentId?: string | null) => Promise<LiteratureCollection>;
  renameCollection: (projectRoot: string, collectionId: string, name: string) => Promise<void>;
  deleteCollection: (projectRoot: string, collectionId: string) => Promise<void>;
  addCheckedToCollection: (projectRoot: string, collectionId: string) => Promise<void>;
  addPapersToCollection: (
    projectRoot: string,
    collectionId: string,
    paperIds: string[],
  ) => Promise<void>;
  removeCheckedFromCollection: (projectRoot: string, collectionId: string) => Promise<void>;

  setSearchQuery: (query: string) => void;
  runSearch: (projectRoot: string, query: string) => Promise<void>;
  refresh: (projectRoot: string) => Promise<void>;
  refreshPdfCacheStatus: (projectRoot: string) => Promise<void>;
  markPaperPdfCached: (paperId: string) => void;
  selectPaper: (paperId: string | null) => void;
  togglePaperChecked: (paperId: string) => void;
  setCheckedPaperIds: (paperIds: string[]) => void;
  clearCheckedPapers: () => void;
  createPaper: (projectRoot: string, input: LiteraturePaperPatch) => Promise<LiteraturePaper>;
  updatePaper: (
    projectRoot: string,
    paperId: string,
    patch: LiteraturePaperPatch,
    opts?: { silent?: boolean },
  ) => Promise<LiteraturePaper>;
  deletePaper: (projectRoot: string, paperId: string) => Promise<void>;
  deletePapers: (projectRoot: string, paperIds: string[]) => Promise<void>;
  importToLocal: (projectRoot: string, paperId: string) => Promise<void>;
  exportPapersBibTeX: (projectRoot: string, paperIds: string[]) => Promise<boolean>;
  ingestPdf: (
    projectRoot: string,
    pdfPath: string,
    opts?: { quiet?: boolean },
  ) => Promise<LiteraturePaper>;
  /** Queue PDF paths for background import — does not block the UI. */
  enqueuePdfImports: (projectRoot: string, pdfPaths: string[]) => void;
  addByIdentifier: (
    projectRoot: string,
    ids: {
      doi?: string;
      arxivId?: string;
      isbn?: string;
      pmid?: string;
      adsBibcode?: string;
    },
  ) => Promise<LiteraturePaper | null>;
  fetchMetadata: (projectRoot: string, paperId: string) => Promise<LiteraturePaper>;
  downloadPdf: (projectRoot: string, paperId: string) => Promise<LiteraturePaper>;
  attachLocalPdf: (
    projectRoot: string,
    paperId: string,
    pdfPath: string,
    opts?: { ignoreIdentifierConflict?: boolean },
  ) => Promise<import("@/types/electron.d").LiteratureAttachLocalPdfResult>;
  importBibTeX: (projectRoot: string, bibContent: string, jsonContent?: string) => Promise<void>;
  /** Recreate a library entry from an unlinked reading note and refresh frontmatter. */
  recoverPaperFromNote: (
    projectRoot: string,
    relativePath: string,
    content: string,
  ) => Promise<LiteraturePaper>;
  loadAnnotations: (projectRoot: string, paperId: string) => Promise<LiteratureAnnotation[]>;
  saveAnnotation: (
    projectRoot: string,
    annotation: Omit<LiteratureAnnotation, "created_at" | "updated_at">,
  ) => Promise<void>;
  deleteAnnotation: (projectRoot: string, annotationId: string) => Promise<void>;
}

function duplicateIdentifierMessage(reason?: "doi" | "arxiv"): string {
  return reason === "doi"
    ? "DOI already in library — metadata refreshed"
    : "arXiv ID already in library — metadata refreshed";
}

function toastPdfAttached(pdfAttached?: boolean): void {
  if (pdfAttached) toast.success("PDF downloaded and attached");
}

function toastPdfDownloadFailure(raw?: string | null): void {
  if (!raw?.trim()) return;
  const { title, description } = formatPdfDownloadFailure(raw);
  if (title === "PDF already attached") return;
  toast.error(title, description ? { description } : undefined);
}

function toastPdfDownloadResult(pdfAttached?: boolean, pdfAttachError?: string | null): void {
  if (pdfAttached) {
    toastPdfAttached(true);
    return;
  }
  toastPdfDownloadFailure(pdfAttachError);
}

async function withCollectionWritePending<T>(
  set: (partial: Partial<LiteratureState>) => void,
  fn: () => Promise<T>,
): Promise<T> {
  set({ collectionWritePending: true });
  try {
    return await fn();
  } finally {
    set({ collectionWritePending: false });
  }
}

/** Serializes drag/menu PDF imports so enrich/scan steps do not overlap. */
let pdfImportSerial = Promise.resolve();

export const useLiteratureStore = create<LiteratureState>((set, get) => ({
  papers: [],
  selectedPaperId: null,
  checkedPaperIds: [],
  searchQuery: "",
  searchResults: null,
  loading: false,
  error: null,
  libraryView: { kind: "all" },
  librarySortColumn: "year",
  librarySortDirection: "desc",
  libraryTagFilter: null,
  librarySubview: "library",
  pendingCitationJumpRefId: null,
  collections: [],
  viewPaperIds: null,
  zoteroStatus: null,
  boundCollectionId: null,
  boundCollectionName: null,
  lastZoteroSyncAt: null,
  pullingFromZotero: false,
  collectionWritePending: false,
  pdfCacheStatus: {},
  bbtBannerDismissed: false,
  zoteroAutoPullDoneForRoot: null,
  readerExcerpt: null,
  pdfImportBusyCount: 0,
  pdfImportQueuedCount: 0,
  pdfDownloadProgress: {},
  setPdfDownloadProgress: (payload) => {
    if (payload.phase === "done") {
      set((state) => {
        const next = { ...state.pdfDownloadProgress };
        delete next[payload.paperId];
        return { pdfDownloadProgress: next };
      });
      return;
    }
    const phase = payload.phase === "downloading" ? "downloading" : "resolving";
    set((state) => ({
      pdfDownloadProgress: {
        ...state.pdfDownloadProgress,
        [payload.paperId]: {
          phase,
          receivedBytes: payload.receivedBytes,
          totalBytes: payload.totalBytes,
        },
      },
    }));
  },
  setReaderExcerpt: (excerpt) => set({ readerExcerpt: excerpt }),

  dismissBbtBanner: () => set({ bbtBannerDismissed: true }),

  probeZotero: async () => {
    const status = await window.electronAPI.zoteroProbe();
    set({ zoteroStatus: status });
    return status;
  },

  loadProjectBinding: async (projectRoot) => {
    const binding = await window.electronAPI.zoteroGetProjectBinding(projectRoot);
    const { lastSyncAt } = await window.electronAPI.zoteroGetLastSync(projectRoot);
    set({
      boundCollectionId: binding.zoteroCollectionId ?? null,
      boundCollectionName: binding.zoteroCollectionName ?? null,
      lastZoteroSyncAt: lastSyncAt,
    });
  },

  bootstrapLiterature: async (projectRoot) => {
    applyLiteratureUiPrefs(projectRoot);
    if (get().libraryView.kind === "reading-list") {
      set({ libraryView: { kind: "all" }, viewPaperIds: null });
      void persistLiteratureUiPrefs(projectRoot, { libraryView: { kind: "all" } });
    }
    void get().probeZotero();
    await get().loadProjectBinding(projectRoot);
    const bound = get().boundCollectionId;
    if (!bound) {
      await get().refresh(projectRoot);
      return;
    }
    if (get().zoteroAutoPullDoneForRoot === projectRoot) {
      await get().refresh(projectRoot);
      return;
    }
    try {
      await get().pullFromZotero(projectRoot, { silent: true });
      set({ zoteroAutoPullDoneForRoot: projectRoot });
    } catch {
      // Manual Refresh can retry; avoid blocking auto-pull on transient Zotero errors.
    }
  },

  setBoundCollection: async (projectRoot, collectionId, collectionName) => {
    const binding = await window.electronAPI.zoteroSetProjectBinding(
      projectRoot,
      collectionId,
      collectionName,
    );
    set({
      boundCollectionId: binding.zoteroCollectionId ?? null,
      boundCollectionName: binding.zoteroCollectionName ?? null,
      zoteroAutoPullDoneForRoot: null,
    });
    if (!binding.zoteroCollectionId) {
      // Disconnected — refresh local list + collections (Zotero mirrors detached → manual)
      set({ libraryView: { kind: "all" } });
      void persistLiteratureUiPrefs(projectRoot, { libraryView: { kind: "all" } });
      await get().refreshCollections(projectRoot);
      await get().refresh(projectRoot);
      if (binding.detached) {
        const { papers, collections } = binding.detached;
        if (papers > 0 || collections > 0) {
          toast.success(`Disconnected from Zotero — removed ${papers} unused Zotero mirrors and ${collections} collections. Kept entries stay in the library.`);
        } else {
          toast.success("Disconnected from Zotero.");
        }
      }
    }
  },

  pullFromZotero: async (projectRoot, options) => {
    const silent = options?.silent ?? false;
    set({ pullingFromZotero: true, error: null });
    try {
      const result = await window.electronAPI.zoteroPullCollection(projectRoot);
      const { lastSyncAt } = await window.electronAPI.zoteroGetLastSync(projectRoot);
      set({ lastZoteroSyncAt: lastSyncAt });
      await get().refresh(projectRoot);
      if (!silent) {
        const pruneNote =
          result.papersPruned > 0 || result.collectionsPruned > 0
            ? ` (removed ${result.papersPruned} papers, ${result.collectionsPruned} collections)`
            : "";
        toast.success(`Synced ${result.papersUpserted} papers from Zotero${pruneNote}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zotero sync failed";
      set({ error: message });
      if (!silent) toast.error(message);
      throw err;
    } finally {
      set({ pullingFromZotero: false });
    }
  },

  pullZoteroCollections: async (projectRoot) => {
    set({ pullingFromZotero: true, error: null });
    try {
      const result = await window.electronAPI.zoteroPullCollections(projectRoot);
      await get().refreshCollections(projectRoot);
      const pruneNote =
        result.collectionsPruned > 0 ? `, removed ${result.collectionsPruned} stale` : "";
      toast.success(`Synced ${result.collectionsUpserted} Zotero collections${pruneNote}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Zotero collection sync failed";
      set({ error: message });
      toast.error(message);
      throw err;
    } finally {
      set({ pullingFromZotero: false });
    }
  },

  setLibraryView: (view) => {
    set({ libraryView: view });
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (projectRoot) void persistLiteratureUiPrefs(projectRoot, { libraryView: view });
  },

  setLibrarySort: (column, direction) => {
    set({ librarySortColumn: column, librarySortDirection: direction });
    const projectRoot = useDocumentStore.getState().projectRoot;
    if (projectRoot) {
      void persistLiteratureUiPrefs(projectRoot, {
        sortColumn: column,
        sortDirection: direction,
      });
    }
  },

  setLibraryTagFilter: async (projectRoot, tag) => {
    set({ libraryTagFilter: tag });
    await persistLiteratureUiPrefs(projectRoot, { libraryTagFilter: tag });
  },

  setLibrarySubview: (view) => {
    set({ librarySubview: view });
  },

  setPendingCitationJump: (refId) => {
    set({ pendingCitationJumpRefId: refId });
  },

  clearPendingCitationJump: () => {
    set({ pendingCitationJumpRefId: null });
  },

  refreshCollections: async (projectRoot) => {
    const collections = await window.electronAPI.literatureListCollections(projectRoot);
    set({ collections });
    reconcileLibraryViewWithCollections(projectRoot, collections);
  },

  loadViewPaperIds: async (projectRoot) => {
    const { libraryView } = get();
    if (libraryView.kind === "all") {
      set({ viewPaperIds: null });
      return;
    }
    if (libraryView.kind === "reading-list") {
      const papers = await window.electronAPI.literatureReadingList(projectRoot);
      set({ viewPaperIds: papers.map((p) => p.id) });
      return;
    }
    const ids = await window.electronAPI.literatureListCollectionPaperIds(
      projectRoot,
      libraryView.collectionId,
    );
    set({ viewPaperIds: ids });
  },

  createCollection: async (projectRoot, name, parentId) => {
    return withCollectionWritePending(set, async () => {
      const collection = await window.electronAPI.literatureCreateCollection(
        projectRoot,
        name,
        parentId,
      );
      await get().refreshCollections(projectRoot);
      toast.success(`Collection “${collection.name}” created`);
      return collection;
    });
  },

  renameCollection: async (projectRoot, collectionId, name) => {
    await withCollectionWritePending(set, async () => {
      await window.electronAPI.literatureUpdateCollection(projectRoot, collectionId, name);
      await get().refreshCollections(projectRoot);
      toast.success("Collection renamed");
    });
  },

  deleteCollection: async (projectRoot, collectionId) => {
    await withCollectionWritePending(set, async () => {
      await window.electronAPI.literatureDeleteCollection(projectRoot, collectionId);
      const { libraryView } = get();
      if (libraryView.kind === "collection" && libraryView.collectionId === collectionId) {
        set({ libraryView: { kind: "all" }, viewPaperIds: null });
      }
      await get().refreshCollections(projectRoot);
      toast.success("Collection deleted");
    });
  },

  addPapersToCollection: async (projectRoot, collectionId, paperIds) => {
    if (!paperIds.length) return;
    await withCollectionWritePending(set, async () => {
      const { added, skipped } = await window.electronAPI.literatureAddPapersToCollection(
        projectRoot,
        collectionId,
        paperIds,
      );
      await get().refreshCollections(projectRoot);
      const { libraryView } = get();
      if (libraryView.kind === "collection" && libraryView.collectionId === collectionId) {
        await get().loadViewPaperIds(projectRoot);
      }
      if (skipped > 0) {
        toast.warning(
          `Added ${added} entr${added === 1 ? "y" : "ies"}; ${skipped} local onl${skipped === 1 ? "y" : "ies"} not synced to Zotero`,
        );
      } else {
        toast.success(`Added ${added} entr${added === 1 ? "y" : "ies"} to collection`);
      }
    });
  },

  addCheckedToCollection: async (projectRoot, collectionId) => {
    const { checkedPaperIds } = get();
    if (!checkedPaperIds.length) return;
    await get().addPapersToCollection(projectRoot, collectionId, checkedPaperIds);
  },

  removeCheckedFromCollection: async (projectRoot, collectionId) => {
    const { checkedPaperIds } = get();
    if (!checkedPaperIds.length) return;
    await withCollectionWritePending(set, async () => {
      const { removed } = await window.electronAPI.literatureRemovePapersFromCollection(
        projectRoot,
        collectionId,
        checkedPaperIds,
      );
      await get().refreshCollections(projectRoot);
      await get().loadViewPaperIds(projectRoot);
      toast.success(`Removed ${removed} entr${removed === 1 ? "y" : "ies"} from collection`);
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  runSearch: async (projectRoot, query) => {
    const q = query.trim();
    if (q.length < 2) {
      set({ searchResults: null });
      return;
    }
    try {
      const results = await window.electronAPI.literatureSearch(projectRoot, q, 100);
      set({ searchResults: results });
    } catch (err) {
      console.warn("[literature] search failed:", err);
      set({ searchResults: null });
    }
  },

  refresh: async (projectRoot) => {
    if (!projectRoot) return;
    set({ loading: true, error: null });
    try {
      const papers = await window.electronAPI.literatureList(projectRoot);
      useCitationStagingStore.getState().reconcileWithLibrary(papers);
      let libraryTagFilter = get().libraryTagFilter;
      if (libraryTagFilter) {
        const stillExists = collectProjectTags(papers).some(
          (e) => paperTagKey(e.tag) === paperTagKey(libraryTagFilter!),
        );
        if (!stillExists) {
          libraryTagFilter = null;
          void persistLiteratureUiPrefs(projectRoot, { libraryTagFilter: null });
        }
      }
      set({ papers, loading: false, libraryTagFilter });
      await get().refreshPdfCacheStatus(projectRoot);
      await get().refreshCollections(projectRoot);
      await get().loadViewPaperIds(projectRoot);
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  refreshPdfCacheStatus: async (projectRoot) => {
    if (!projectRoot) return;
    try {
      const status = await window.electronAPI.literatureGetPdfCacheStatus(projectRoot);
      set({ pdfCacheStatus: status });
    } catch {
      // non-fatal — list UI degrades to no cache badges
    }
  },

  markPaperPdfCached: (paperId) => {
    set((state) => ({
      pdfCacheStatus: {
        ...state.pdfCacheStatus,
        [paperId]: { cached: true, stale: false },
      },
    }));
  },

  selectPaper: (paperId) => {
    set({ selectedPaperId: paperId });
  },

  togglePaperChecked: (paperId) => {
    const { checkedPaperIds } = get();
    if (checkedPaperIds.includes(paperId)) {
      set({ checkedPaperIds: checkedPaperIds.filter((id) => id !== paperId) });
    } else {
      set({ checkedPaperIds: [...checkedPaperIds, paperId] });
    }
  },

  setCheckedPaperIds: (paperIds) => set({ checkedPaperIds: paperIds }),

  clearCheckedPapers: () => set({ checkedPaperIds: [] }),

  createPaper: async (projectRoot, input) => {
    const { paper, created } = await window.electronAPI.literatureCreatePaper(projectRoot, input);
    await get().refresh(projectRoot);
    get().selectPaper(paper.id);
    if (created) toast.success("Entry created");
    return paper;
  },

  updatePaper: async (projectRoot, paperId, patch, opts) => {
    const paper = await window.electronAPI.literatureUpdatePaper(projectRoot, paperId, patch);
    await get().refresh(projectRoot);
    if (!opts?.silent) toast.success("Saved");
    return paper;
  },

  deletePaper: async (projectRoot, paperId) => {
    await window.electronAPI.literatureDeletePaper(projectRoot, paperId);
    useRightPanelStore.getState().closeLiteraturePaperTabs(paperId);
    useCitationStagingStore.getState().unmarkByPaperIds([paperId]);
    const { selectedPaperId, checkedPaperIds } = get();
    if (selectedPaperId === paperId) {
      set({ selectedPaperId: null });
    }
    if (checkedPaperIds.includes(paperId)) {
      set({ checkedPaperIds: checkedPaperIds.filter((id) => id !== paperId) });
    }
    await get().refresh(projectRoot);
    toast.success("Entry deleted");
  },

  importToLocal: async (projectRoot, paperId) => {
    await window.electronAPI.literatureImportToLocal(projectRoot, paperId);
    await get().refresh(projectRoot);
    toast.success("Kept in project library.");
  },

  recoverPaperFromNote: async (projectRoot, relativePath, content) => {
    const notebookDir = resolveNotebookDir(useWorkspaceConfigStore.getState().workspaceDirs);
    const patch = paperPatchFromNote(content, relativePath, notebookDir);

    let paper: LiteraturePaper;
    if (patch.doi) {
      const result = await window.electronAPI.literatureCreateFromIdentifier(projectRoot, {
        doi: patch.doi,
      });
      paper = result.paper;
      if (!result.created) toast.info(duplicateIdentifierMessage(result.duplicateReason));
    } else if (patch.arxiv_id) {
      const result = await window.electronAPI.literatureCreateFromIdentifier(projectRoot, {
        arxivId: patch.arxiv_id,
      });
      paper = result.paper;
      if (!result.created) toast.info(duplicateIdentifierMessage(result.duplicateReason));
    } else {
      const result = await window.electronAPI.literatureCreatePaper(projectRoot, {
        ...patch,
        bibkey: patch.bibkey,
      });
      paper = result.paper;
      if (!result.created) toast.info("Linked to existing library entry");
    }

    await get().refresh(projectRoot);

    const updated = patchNoteLinkFrontmatter(content, {
      paperId: paper.id,
      bibkey: paper.bibkey,
    });
    await persistNoteContent(projectRoot, relativePath, updated);

    get().selectPaper(paper.id);
    useRightPanelStore.getState().openLiteraturePaper(paper.id, paper.title, "reader");
    toast.success("Library entry restored from note");
    return paper;
  },

  deletePapers: async (projectRoot, paperIds) => {
    if (!paperIds.length) return;
    for (const paperId of paperIds) {
      await window.electronAPI.literatureDeletePaper(projectRoot, paperId);
      useRightPanelStore.getState().closeLiteraturePaperTabs(paperId);
    }
    useCitationStagingStore.getState().unmarkByPaperIds(paperIds);
    const { selectedPaperId } = get();
    if (selectedPaperId && paperIds.includes(selectedPaperId)) {
      set({ selectedPaperId: null });
    }
    set({ checkedPaperIds: [] });
    await get().refresh(projectRoot);
    toast.success(`Deleted ${paperIds.length} entr${paperIds.length === 1 ? "y" : "ies"}`);
  },

  exportPapersBibTeX: async (projectRoot, paperIds) => {
    if (!paperIds.length) return false;
    const { canceled, path } = await window.electronAPI.literatureExportBibToFile(
      projectRoot,
      paperIds,
      "references.bib",
    );
    if (canceled || !path) return false;
    toast.success(`Exported to ${path.split(/[/\\]/).pop() ?? "file"}`);
    return true;
  },

  ingestPdf: async (projectRoot, pdfPath, opts) => {
    const quiet = opts?.quiet ?? false;
    set({ pdfImportBusyCount: get().pdfImportBusyCount + 1 });
    const fileName = pdfPath.split(/[/\\]/).pop() ?? "";
    try {
      const result = await window.electronAPI.literatureIngestPdf(projectRoot, pdfPath);

      if (!result.created && result.duplicateReason === "pdf") {
        await get().refresh(projectRoot);
        if (!quiet) {
          get().selectPaper(result.paper.id);
          toast.info("This PDF is already in the library");
        }
        return result.paper;
      }

      let paper = result.paper;
      let identifiersFound = result.identifiersFound ?? false;
      let identifiers = result.identifiers;
      let enriched = result.enriched ?? false;
      let enrichError = result.enrichError;
      let pdfAttached = result.pdfAttached ?? false;

      if (result.created && !identifiersFound) {
        try {
          const { pdfBytes } = await window.electronAPI.literatureReadPdfBytes(projectRoot, paper.id);
          if (pdfBytes) {
            const ids = await extractIdsFromPdf(pdfBytes, fileName);
            if (ids.doi || ids.arxivId) {
              const applied = await window.electronAPI.literatureApplyIdentifiers(projectRoot, paper.id, {
                doi: ids.doi,
                arxivId: ids.arxivId,
              });
              if (applied.duplicatePaper) {
                await window.electronAPI.literatureDeletePaper(projectRoot, paper.id);
                useRightPanelStore.getState().closeLiteraturePaperTabs(paper.id);
                useCitationStagingStore.getState().unmarkByPaperIds([paper.id]);
                paper = applied.duplicatePaper;
                identifiersFound = true;
                identifiers = ids;
              } else if (applied.applied && applied.paper) {
                paper = applied.paper;
                identifiersFound = true;
                identifiers = ids;
                try {
                  const fetchResult = await window.electronAPI.literatureFetchAndApplyMetadata(
                    projectRoot,
                    paper.id,
                  );
                  paper = fetchResult.paper;
                  enriched = true;
                  if (fetchResult.pdfAttached) pdfAttached = true;
                } catch (err) {
                  enrichError = err instanceof Error ? err.message : String(err);
                }
              }
            }
          }
        } catch (err) {
          console.warn("[literature] renderer PDF identifier fallback failed:", err);
        }
      }

      await get().refresh(projectRoot);
      if (!quiet) {
        get().selectPaper(paper.id);
      }

      if (!quiet) {
        if (identifiersFound && identifiers) {
          const label = identifiers.doi
            ? `DOI ${identifiers.doi}`
            : identifiers.arxivId
              ? `arXiv ${identifiers.arxivId}`
              : null;
          if (label) toast.success(`Found ${label}`);
        } else if (result.created) {
          toast.info("No DOI/arXiv in PDF. Add manually, then use Fetch metadata.");
        }

        if (enrichError) {
          toast.error(enrichError);
        } else if (enriched && result.created) {
          toast.success("Metadata updated");
        }

        toastPdfAttached(pdfAttached);
      } else if (enrichError) {
        toast.error(enrichError);
      }

      return get().papers.find((p) => p.id === paper.id) ?? paper;
    } finally {
      set({ pdfImportBusyCount: Math.max(0, get().pdfImportBusyCount - 1) });
    }
  },

  enqueuePdfImports: (projectRoot, pdfPaths) => {
    if (!pdfPaths.length) return;
    const batch = pdfPaths.length > 1;
    set({ pdfImportQueuedCount: get().pdfImportQueuedCount + pdfPaths.length });

    pdfImportSerial = pdfImportSerial
      .then(async () => {
        let succeeded = 0;
        let failed = 0;
        for (const pdfPath of pdfPaths) {
          set({ pdfImportQueuedCount: Math.max(0, get().pdfImportQueuedCount - 1) });
          try {
            await get().ingestPdf(projectRoot, pdfPath, { quiet: batch });
            succeeded += 1;
          } catch (err) {
            failed += 1;
            const name = pdfPath.split(/[/\\]/).pop() ?? pdfPath;
            toast.error(err instanceof Error ? err.message : `Failed to import ${name}`);
          }
        }
        if (batch) {
          if (failed === 0) {
            toast.success(`Imported ${succeeded} PDF${succeeded === 1 ? "" : "s"}`);
          } else {
            toast.info(`Imported ${succeeded} of ${pdfPaths.length} PDFs (${failed} failed)`);
          }
        }
      })
      .catch(() => {});
  },

  addByIdentifier: async (projectRoot, ids) => {
    if (!ids.doi && !ids.arxivId && !ids.isbn && !ids.pmid && !ids.adsBibcode) return null;
    const { paper, created, duplicateReason, pdfAttached, pdfAttachError } =
      await window.electronAPI.literatureCreateFromIdentifier(projectRoot, ids);
    await get().refresh(projectRoot);
    get().selectPaper(paper.id);
    if (!created) {
      toast.info(duplicateIdentifierMessage(duplicateReason));
    } else {
      toast.success(`Added: ${paper.title}`);
    }
    toastPdfDownloadResult(pdfAttached, pdfAttachError);
    return paper;
  },

  fetchMetadata: async (projectRoot, paperId) => {
    const result = await window.electronAPI.literatureFetchAndApplyMetadata(projectRoot, paperId);
    await get().refresh(projectRoot);
    toast.success("Metadata updated");
    toastPdfDownloadResult(result.pdfAttached, result.pdfAttachError);
    return result.paper;
  },

  downloadPdf: async (projectRoot, paperId) => {
    const result = await window.electronAPI.literatureDownloadPdf(projectRoot, paperId);
    await get().refresh(projectRoot);
    toastPdfDownloadResult(result.attached, result.attachError);
    return result.paper;
  },

  attachLocalPdf: async (projectRoot, paperId, pdfPath, opts) => {
    const result = await window.electronAPI.literatureAttachLocalPdf(
      projectRoot,
      paperId,
      pdfPath,
      opts,
    );
    await get().refresh(projectRoot);
    return result;
  },

  importBibTeX: async (projectRoot, bibContent, jsonContent) => {
    const { imported, skipped, pdfsAttached } = await window.electronAPI.literatureImportBibTeX(
      projectRoot,
      bibContent,
      jsonContent,
    );
    await get().refresh(projectRoot);
    if (imported > 0) {
      toast.success(`Imported ${imported} entr${imported === 1 ? "y" : "ies"} (${skipped} skipped)`);
    } else if (skipped > 0) {
      toast.info(`No new entries (${skipped} skipped)`);
    }
    if (pdfsAttached && pdfsAttached > 0) {
      toast.success(
        `Downloaded ${pdfsAttached} PDF${pdfsAttached === 1 ? "" : "s"} from arXiv`,
      );
    }
  },

  loadAnnotations: async (projectRoot, paperId) => {
    return await window.electronAPI.literatureGetAnnotations(projectRoot, paperId);
  },

  saveAnnotation: async (projectRoot, annotation) => {
    await window.electronAPI.literatureSaveAnnotation(projectRoot, annotation);
  },

  deleteAnnotation: async (projectRoot, annotationId) => {
    await window.electronAPI.literatureDeleteAnnotation(projectRoot, annotationId);
  },
}));

if (typeof window !== "undefined" && window.electronAPI?.onLiteraturePdfDownloadProgress) {
  window.electronAPI.onLiteraturePdfDownloadProgress((data) => {
    useLiteratureStore.getState().setPdfDownloadProgress(data);
  });
}
