import { create } from "zustand";

export type AppMode = "manuscript" | "vault" | "zotero" | "chat" | "code";

export interface EditorTab {
  id: string;
  name: string;
}

interface LayoutState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;

  sidebarExpanded: boolean;
  sidebarWidth: number;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarWidth: (width: number) => void;

  editorTabs: EditorTab[];
  activeEditorTab: string | null;
  openEditorTab: (tab: EditorTab) => void;
  closeEditorTab: (id: string) => void;
  setActiveEditorTab: (id: string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeMode: "chat",
  setActiveMode: (mode) => set({ activeMode: mode }),

  sidebarExpanded: true,
  sidebarWidth: 240,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  editorTabs: [
    { id: "main.tex", name: "main.tex" },
    { id: "intro.tex", name: "intro.tex" },
    { id: "refs.bib", name: "refs.bib" },
  ],
  activeEditorTab: "main.tex",
  openEditorTab: (tab) =>
    set((s) => {
      const exists = s.editorTabs.find((t) => t.id === tab.id);
      if (exists) return { activeEditorTab: tab.id };
      return {
        editorTabs: [...s.editorTabs, tab],
        activeEditorTab: tab.id,
      };
    }),
  closeEditorTab: (id) =>
    set((s) => {
      const next = s.editorTabs.filter((t) => t.id !== id);
      return {
        editorTabs: next,
        activeEditorTab:
          s.activeEditorTab === id ? (next[next.length - 1]?.id ?? null) : s.activeEditorTab,
      };
    }),
  setActiveEditorTab: (id) => set({ activeEditorTab: id }),
}));
