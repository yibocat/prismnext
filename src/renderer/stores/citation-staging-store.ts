import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  StagedCitation,
  StagedCitationPayload,
  StagedAddProgressEvent,
  StageResult,
} from "../../shared/citation-staging";
import {
  buildLibraryIdentityIndex,
  findLibraryPaperInIdentityIndex,
  type LibraryPaperLinkTarget,
} from "../../shared/staged-citation-library-match";
import { useLiteratureStore } from "./literature-store";
import { useDocumentStore } from "./document-store";
import { toast } from "sonner";
import { formatPdfDownloadFailure } from "../../shared/pdf-download-messages";

/** Stable empty list for zustand selectors (avoid `?? []` creating new refs). */
export const EMPTY_STAGED_CITATIONS: StagedCitation[] = [];

/** True when the staged citation still points at a paper in the current library list. */
export function isCitationInLibrary(
  citation: StagedCitation,
  libraryPaperIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    citation.addedToLibrary &&
      citation.libraryPaperId &&
      libraryPaperIds.has(citation.libraryPaperId),
  );
}

/**
 * Citation staging — AI-referenced papers held for user confirmation
 * before being added to the project literature library.
 *
 * See `docs/superpowers/specs/2026-07-01-chat-citation-staging-design.md`.
 *
 * Lifecycle: each chat tab owns a `sessionId`; staged citations are kept
 * per session in memory + localStorage. Clearing happens on chat-tab
 * close or project switch.
 */
interface CitationStagingState {
  bySession: Record<string, StagedCitation[]>;
  activeSessionId: string | null;
  /** User cleared session citations — block transcript backfill until next live stage. */
  backfillSuppressedSessions: Record<string, true>;
  /** Panel list hidden for session; citation data kept for chat [n] links. */
  panelHiddenSessions: Record<string, true>;
  /** Live add-to-library progress keyed by staged citation id. */
  addProgressById: Record<string, StagedAddProgressEvent>;
  /** Batch add summary for toolbar / list chrome. */
  batchAdd: { sessionId: string; total: number; completed: number; failed: number } | null;

  setAddProgress: (event: StagedAddProgressEvent) => void;
  clearAddProgress: (stagedId: string) => void;
  setBatchAdd: (batch: CitationStagingState["batchAdd"]) => void;

  setActiveSession: (sessionId: string | null) => void;

  /**
   * Merge a `literature:stage` result into the session. Assigns the next
   * available refId (or reuses an existing one when the same DOI/arXiv
   * is already staged in this session). Returns the staged citation id
   * (caller may use it to scroll/highlight) or null when not verified.
   */
  upsertFromStageResult: (sessionId: string, result: StageResult) => string | null;

  /** Apply many stage results in one store update (transcript backfill). */
  mergeStageResultsBatch: (sessionId: string, results: StageResult[]) => void;

  /** Mark a staged citation as successfully added to the library. */
  markAddedToLibrary: (id: string, paperId: string, bibkey: string) => void;

  /** Remove all staged citations for a session (chat tab closed). */
  removeBySession: (sessionId: string) => void;

  /** Hide session citations in the Literature panel; keep data for chat [n] links. */
  clearPanelForSession: (sessionId: string) => void;

  /** Show session citations in the panel again (e.g. jump from chat [n]). */
  revealPanelForSession: (sessionId: string) => void;

  /** Clear every session (project switch). */
  clearAll: () => void;

  /** Read-only accessor. */
  getCitationsForSession: (sessionId: string) => StagedCitation[];

  /** Add a single staged citation to the project library (user-confirmed). */
  addToLibrary: (
    id: string,
    batch?: { index: number; total: number },
  ) => Promise<{ ok: boolean; bibkey?: string; error?: string }>;

  /** Add all pending citations in a session. Returns summary counts. */
  addAllToLibrary: (sessionId: string) => Promise<{ added: number; failed: number }>;

  /** Remove a single staged citation by id (user dismissed). */
  removeById: (id: string) => void;

  /** Reset library-added state for staged citations whose library paper was deleted. */
  unmarkByPaperIds: (paperIds: string[]) => void;

  /** Drop stale links and backfill libraryPaperId from DOI/arXiv when papers exist in library.db. */
  reconcileWithLibrary: (papers: LibraryPaperLinkTarget[]) => void;
}

function nextRefId(list: StagedCitation[]): number {
  return list.reduce((max, c) => (c.refId > max ? c.refId : max), 0) + 1;
}

function findExistingStaged(
  list: StagedCitation[],
  ids: { doi?: string | null; arxivId?: string | null },
): StagedCitation | undefined {
  const doi = ids.doi?.trim().toLowerCase();
  const arxiv = ids.arxivId?.trim().toLowerCase();
  return list.find(
    (c) =>
      (doi && c.doi?.toLowerCase() === doi) ||
      (arxiv && c.arxivId?.toLowerCase() === arxiv),
  );
}

function payloadToCitation(
  payload: StagedCitationPayload,
  refId: number,
  sessionId: string,
  id: string,
): StagedCitation {
  return {
    id,
    refId,
    sessionId,
    title: payload.title,
    authors: payload.authors,
    year: payload.year,
    venue: payload.venue,
    type: payload.type,
    doi: payload.doi,
    arxivId: payload.arxivId,
    abstract: payload.abstract,
    cslJson: payload.cslJson,
    sourceUrl: payload.sourceUrl,
    catalogSource: payload.catalogSource,
    catalogVerified: payload.catalogVerified,
    verifyError: payload.verifyError,
    discoveredFrom: payload.discoveredFrom,
    libraryPaperId: payload.libraryPaperId,
    libraryBibkey: payload.libraryBibkey,
    addedToLibrary: Boolean(payload.libraryPaperId),
    addedAt: payload.libraryPaperId ? Date.now() : null,
    createdAt: Date.now(),
  };
}

let _idSeq = 0;
function newId(): string {
  return `staged-${Date.now().toString(36)}-${(++_idSeq).toString(36)}`;
}

function mergeStageResultIntoList(
  list: StagedCitation[],
  sessionId: string,
  result: StageResult,
): { list: StagedCitation[]; id: string | null } {
  if (!result.verified || !result.citation) {
    return { list, id: null };
  }
  const existing = findExistingStaged(list, {
    doi: result.citation.doi,
    arxivId: result.citation.arxivId,
  });
  if (existing) {
    const updated: StagedCitation = {
      ...existing,
      title: result.citation.title || existing.title,
      authors: result.citation.authors ?? existing.authors,
      year: result.citation.year ?? existing.year,
      venue: result.citation.venue ?? existing.venue,
      type: result.citation.type ?? existing.type,
      abstract: result.citation.abstract ?? existing.abstract,
      catalogSource: result.citation.catalogSource ?? existing.catalogSource,
      catalogVerified: true,
      verifyError: null,
      libraryPaperId: result.citation.libraryPaperId ?? existing.libraryPaperId,
      libraryBibkey: result.citation.libraryBibkey ?? existing.libraryBibkey,
      addedToLibrary:
        existing.addedToLibrary || Boolean(result.citation.libraryPaperId),
    };
    return {
      list: list.map((c) => (c.id === existing.id ? updated : c)),
      id: updated.id,
    };
  }
  const refId = result.refId && result.refId > 0 ? result.refId : nextRefId(list);
  const id = newId();
  const citation = payloadToCitation(result.citation, refId, sessionId, id);
  return { list: [...list, citation], id };
}

function reconcileCitationListWithLibrary(
  list: StagedCitation[],
  papers: readonly LibraryPaperLinkTarget[],
): { list: StagedCitation[]; changed: boolean } {
  if (papers.length === 0) return { list, changed: false };

  const idSet = new Set(papers.map((p) => p.id));
  const index = buildLibraryIdentityIndex(papers);
  let changed = false;

  const nextList = list.map((c) => {
    let citation = c;

    if (citation.libraryPaperId && !idSet.has(citation.libraryPaperId)) {
      changed = true;
      citation = {
        ...citation,
        libraryPaperId: null,
        libraryBibkey: null,
        addedToLibrary: false,
        addedAt: null,
      };
    }

    if (!citation.catalogVerified || (!citation.doi && !citation.arxivId)) {
      return citation;
    }

    const match = findLibraryPaperInIdentityIndex(citation, index);
    if (!match) return citation;

    if (
      citation.libraryPaperId === match.id &&
      citation.libraryBibkey === match.bibkey &&
      citation.addedToLibrary
    ) {
      return citation;
    }

    changed = true;
    return {
      ...citation,
      libraryPaperId: match.id,
      libraryBibkey: match.bibkey,
      addedToLibrary: true,
      addedAt: citation.addedAt ?? Date.now(),
    };
  });

  return { list: nextList, changed };
}

function stagedToImportInput(
  target: StagedCitation,
  batch?: { index: number; total: number },
) {
  return {
    stagedId: target.id,
    sessionId: target.sessionId,
    batchIndex: batch?.index,
    batchTotal: batch?.total,
    title: target.title,
    authors: target.authors,
    year: target.year,
    venue: target.venue,
    type: target.type,
    doi: target.doi,
    arxivId: target.arxivId,
    abstract: target.abstract,
    cslJson: target.cslJson,
    catalogSource: target.catalogSource,
    catalogVerified: target.catalogVerified,
  };
}

export const useCitationStagingStore = create<CitationStagingState>()(
  persist(
    (set, get) => ({
      bySession: {},
      activeSessionId: null,
      backfillSuppressedSessions: {},
      panelHiddenSessions: {},
      addProgressById: {},
      batchAdd: null,

      setAddProgress: (event) => {
        set((s) => ({
          addProgressById: {
            ...s.addProgressById,
            [event.stagedId]: event,
          },
        }));
      },

      clearAddProgress: (stagedId) => {
        set((s) => {
          if (!s.addProgressById[stagedId]) return s;
          const addProgressById = { ...s.addProgressById };
          delete addProgressById[stagedId];
          return { addProgressById };
        });
      },

      setBatchAdd: (batch) => set({ batchAdd: batch }),

      setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

      upsertFromStageResult: (sessionId, result) => {
        if (!result.verified || !result.citation) return null;
        let mergedId: string | null = null;
        set((s) => {
          const list = s.bySession[sessionId] ?? [];
          const { list: nextList, id } = mergeStageResultIntoList(list, sessionId, result);
          mergedId = id;
          const { list: linkedList } = reconcileCitationListWithLibrary(
            nextList,
            useLiteratureStore.getState().papers,
          );
          const nextSuppress = { ...s.backfillSuppressedSessions };
          delete nextSuppress[sessionId];
          const nextHidden = { ...s.panelHiddenSessions };
          delete nextHidden[sessionId];
          return {
            bySession: { ...s.bySession, [sessionId]: linkedList },
            backfillSuppressedSessions: nextSuppress,
            panelHiddenSessions: nextHidden,
            activeSessionId: sessionId,
          };
        });
        return mergedId;
      },

      mergeStageResultsBatch: (sessionId, results) => {
        if (results.length === 0) return;
        const libraryPapers = useLiteratureStore.getState().papers;
        set((s) => {
          if (s.backfillSuppressedSessions[sessionId]) return s;
          let list = s.bySession[sessionId] ?? [];
          let changed = false;
          for (const result of results) {
            const { list: nextList, id } = mergeStageResultIntoList(list, sessionId, result);
            if (id != null) {
              list = nextList;
              changed = true;
            }
          }
          if (!changed) return s;
          const { list: linkedList } = reconcileCitationListWithLibrary(list, libraryPapers);
          return {
            bySession: { ...s.bySession, [sessionId]: linkedList },
            activeSessionId: sessionId,
          };
        });
      },

      markAddedToLibrary: (id, paperId, bibkey) => {
        set((s) => {
          const bySession: Record<string, StagedCitation[]> = {};
          for (const [sid, list] of Object.entries(s.bySession)) {
            bySession[sid] = list.map((c) =>
              c.id === id
                ? {
                    ...c,
                    libraryPaperId: paperId,
                    libraryBibkey: bibkey,
                    addedToLibrary: true,
                    addedAt: Date.now(),
                  }
                : c,
            );
          }
          return { bySession };
        });
      },

      removeBySession: (sessionId) => {
        set((s) => {
          const bySession = { ...s.bySession };
          delete bySession[sessionId];
          const panelHiddenSessions = { ...s.panelHiddenSessions };
          delete panelHiddenSessions[sessionId];
          return {
            bySession,
            panelHiddenSessions,
            backfillSuppressedSessions: {
              ...s.backfillSuppressedSessions,
              [sessionId]: true,
            },
          };
        });
      },

      clearPanelForSession: (sessionId) => {
        set((s) => ({
          panelHiddenSessions: { ...s.panelHiddenSessions, [sessionId]: true },
        }));
      },

      revealPanelForSession: (sessionId) => {
        set((s) => {
          if (!s.panelHiddenSessions[sessionId]) return s;
          const panelHiddenSessions = { ...s.panelHiddenSessions };
          delete panelHiddenSessions[sessionId];
          return { panelHiddenSessions };
        });
      },

      clearAll: () =>
        set({
          bySession: {},
          activeSessionId: null,
          backfillSuppressedSessions: {},
          panelHiddenSessions: {},
          addProgressById: {},
          batchAdd: null,
        }),

      getCitationsForSession: (sessionId) => get().bySession[sessionId] ?? EMPTY_STAGED_CITATIONS,

      removeById: (id) => {
        set((s) => {
          const bySession: Record<string, StagedCitation[]> = {};
          for (const [sid, list] of Object.entries(s.bySession)) {
            bySession[sid] = list.filter((c) => c.id !== id);
          }
          return { bySession };
        });
      },

      unmarkByPaperIds: (paperIds) => {
        if (paperIds.length === 0) return;
        const idSet = new Set(paperIds);
        set((s) => {
          let changed = false;
          const bySession: Record<string, StagedCitation[]> = {};
          for (const [sid, list] of Object.entries(s.bySession)) {
            bySession[sid] = list.map((c) => {
              if (c.libraryPaperId && idSet.has(c.libraryPaperId)) {
                changed = true;
                return {
                  ...c,
                  libraryPaperId: null,
                  libraryBibkey: null,
                  addedToLibrary: false,
                  addedAt: null,
                };
              }
              return c;
            });
          }
          return changed ? { bySession } : s;
        });
      },

      reconcileWithLibrary: (papers) => {
        set((s) => {
          let changed = false;
          const bySession: Record<string, StagedCitation[]> = {};
          for (const [sid, list] of Object.entries(s.bySession)) {
            const { list: nextList, changed: sessionChanged } = reconcileCitationListWithLibrary(
              list,
              papers,
            );
            bySession[sid] = nextList;
            if (sessionChanged) changed = true;
          }
          return changed ? { bySession } : s;
        });
      },

      addToLibrary: async (id, batch) => {
        const projectRoot = useDocumentStore.getState().projectRoot;
        if (!projectRoot) {
          return { ok: false, error: "No project open" };
        }
        let target: StagedCitation | undefined;
        for (const list of Object.values(get().bySession)) {
          target = list.find((c) => c.id === id);
          if (target) break;
        }
        if (!target) return { ok: false, error: "Citation not found" };
        if (!target.doi && !target.arxivId) {
          return { ok: false, error: "No DOI or arXiv ID" };
        }
        if (!target.catalogVerified) {
          return { ok: false, error: "Citation not verified" };
        }
        if (target.addedToLibrary && target.libraryPaperId) {
          const linkedPaperId = target.libraryPaperId;
          const stillInLibrary = useLiteratureStore
            .getState()
            .papers.some((p) => p.id === linkedPaperId);
          if (stillInLibrary) {
            return { ok: true, bibkey: target.libraryBibkey ?? undefined };
          }
          get().unmarkByPaperIds([linkedPaperId]);
          target = { ...target, addedToLibrary: false, libraryPaperId: null, libraryBibkey: null };
        }

        get().setAddProgress({
          stagedId: id,
          sessionId: target.sessionId,
          phase: "writing",
          batchIndex: batch?.index,
          batchTotal: batch?.total,
        });

        try {
          const result = await window.electronAPI.literatureCreateFromStagedCitation(
            projectRoot,
            stagedToImportInput(target, batch),
          );
          get().markAddedToLibrary(id, result.paper.id, result.paper.bibkey);
          void useLiteratureStore.getState().bootstrapLiterature(projectRoot);
          if (result.pdfAttachError && result.pdfAttached !== true) {
            const { title, description } = formatPdfDownloadFailure(result.pdfAttachError);
            toast.error(title, description ? { description } : undefined);
          }
          return { ok: true, bibkey: result.paper.bibkey };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, error: message };
        } finally {
          get().clearAddProgress(id);
        }
      },

      addAllToLibrary: async (sessionId) => {
        const list = get().bySession[sessionId] ?? [];
        const pending = list.filter((c) => !c.addedToLibrary);
        const total = pending.length;
        if (total === 0) return { added: 0, failed: 0 };

        get().setBatchAdd({ sessionId, total, completed: 0, failed: 0 });
        let added = 0;
        let failed = 0;
        try {
          for (let i = 0; i < pending.length; i++) {
            const c = pending[i]!;
            const r = await get().addToLibrary(c.id, { index: i + 1, total });
            if (r.ok) {
              added++;
            } else {
              failed++;
              toast.error(`Failed to add "${c.title}": ${r.error ?? "unknown error"}`);
            }
            get().setBatchAdd({
              sessionId,
              total,
              completed: added + failed,
              failed,
            });
          }
          if (added > 0) {
            toast.success(`Added ${added} paper${added > 1 ? "s" : ""} to library`);
          }
          return { added, failed };
        } finally {
          get().setBatchAdd(null);
        }
      },
    }),
    {
      name: "prism-next-citation-staging",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bySession: state.bySession }),
    },
  ),
);

if (typeof window !== "undefined" && window.electronAPI?.onLiteratureStagedAddProgress) {
  window.electronAPI.onLiteratureStagedAddProgress((event) => {
    useCitationStagingStore.getState().setAddProgress(event);
  });
}
