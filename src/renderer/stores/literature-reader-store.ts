import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/debounced-storage";

interface LiteratureReaderState {
  /** Active note relative path per paper id. */
  activeNotePathByPaper: Record<string, string | null>;
  readerFocusPageNonce: number;
  readerFocusPage: number | null;
  annotationDeleteNonce: number;
  annotationDeleteId: string | null;
  /** Notes split pane open per paper (default off — PDF only). */
  notesPaneOpenByPaper: Record<string, boolean>;
  /** Last opened paper tab — keeps PDF mounted when switching to Library home. */
  lastActivePaperId: string | null;
  setActiveNote: (paperId: string, relativePath: string | null) => void;
  setLastActivePaper: (paperId: string | null) => void;
  requestFocusPage: (page: number) => void;
  requestDeleteAnnotation: (annotationId: string) => void;
  setNotesPaneOpen: (paperId: string, open: boolean) => void;
  toggleNotesPane: (paperId: string) => void;
}

export const useLiteratureReaderStore = create<LiteratureReaderState>()(
  persist(
    (set) => ({
      activeNotePathByPaper: {},
      readerFocusPageNonce: 0,
      readerFocusPage: null,
      annotationDeleteNonce: 0,
      annotationDeleteId: null,
      lastActivePaperId: null,
      notesPaneOpenByPaper: {},

      setLastActivePaper: (paperId) => set({ lastActivePaperId: paperId }),

      setActiveNote: (paperId, relativePath) =>
        set((s) => ({
          activeNotePathByPaper: { ...s.activeNotePathByPaper, [paperId]: relativePath },
        })),

      requestFocusPage: (page) =>
        set((s) => ({
          readerFocusPage: page,
          readerFocusPageNonce: s.readerFocusPageNonce + 1,
        })),

      requestDeleteAnnotation: (annotationId) =>
        set((s) => ({
          annotationDeleteId: annotationId,
          annotationDeleteNonce: s.annotationDeleteNonce + 1,
        })),

      setNotesPaneOpen: (paperId, open) =>
        set((s) => ({
          notesPaneOpenByPaper: { ...s.notesPaneOpenByPaper, [paperId]: open },
        })),

      toggleNotesPane: (paperId) =>
        set((s) => ({
          notesPaneOpenByPaper: {
            ...s.notesPaneOpenByPaper,
            [paperId]: !(s.notesPaneOpenByPaper[paperId] ?? false),
          },
        })),
    }),
    {
      name: "prism-literature-reader",
      storage: createJSONStorage(() => createDebouncedStorage()),
      partialize: (state) => ({
        activeNotePathByPaper: state.activeNotePathByPaper,
      }),
    },
  ),
);
