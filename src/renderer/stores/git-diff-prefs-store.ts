import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GitDiffLayout = "unified" | "split";

/** Mirrors `GitFilterMode` in git-store — kept local to avoid circular imports. */
export type PersistedGitFilterMode = "unstaged" | "staged" | "all";

interface GitDiffPrefsState {
  layout: GitDiffLayout;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
  /** Changes list filter — survives leaving Git mode / app restart. */
  filterMode: PersistedGitFilterMode;
  setLayout: (layout: GitDiffLayout) => void;
  setWordWrap: (wordWrap: boolean) => void;
  setIgnoreWhitespace: (ignoreWhitespace: boolean) => void;
  setFilterMode: (mode: PersistedGitFilterMode) => void;
}

export const useGitDiffPrefsStore = create<GitDiffPrefsState>()(
  persist(
    (set) => ({
      layout: "unified",
      wordWrap: true,
      ignoreWhitespace: false,
      filterMode: "all",
      setLayout: (layout) => set({ layout }),
      setWordWrap: (wordWrap) => set({ wordWrap }),
      setIgnoreWhitespace: (ignoreWhitespace) => set({ ignoreWhitespace }),
      setFilterMode: (filterMode) => set({ filterMode }),
    }),
    { name: "prism-git-diff-prefs" },
  ),
);
