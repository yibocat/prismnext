import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GitDiffLayout = "unified" | "split";

interface GitDiffPrefsState {
  layout: GitDiffLayout;
  wordWrap: boolean;
  ignoreWhitespace: boolean;
  setLayout: (layout: GitDiffLayout) => void;
  setWordWrap: (wordWrap: boolean) => void;
  setIgnoreWhitespace: (ignoreWhitespace: boolean) => void;
}

export const useGitDiffPrefsStore = create<GitDiffPrefsState>()(
  persist(
    (set) => ({
      layout: "unified",
      wordWrap: true,
      ignoreWhitespace: false,
      setLayout: (layout) => set({ layout }),
      setWordWrap: (wordWrap) => set({ wordWrap }),
      setIgnoreWhitespace: (ignoreWhitespace) => set({ ignoreWhitespace }),
    }),
    { name: "prism-git-diff-prefs" },
  ),
);
