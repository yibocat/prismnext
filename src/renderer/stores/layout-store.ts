import { create } from "zustand";

export type AppMode = "manuscript" | "vault" | "zotero" | "code" | "assets" | "other" | "chat";

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

  rightAreaExpanded: boolean;
  rightAreaWidth: number;
  rightSidebarWidth: number;
  editorMaximized: boolean;
  toggleRightArea: () => void;
  setRightAreaWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  toggleEditorMaximized: () => void;

  /** Per-mode editor tabs */
  modeEditorTabs: Record<AppMode, EditorTab[]>;
  modeActiveEditorTab: Record<AppMode, string | null>;
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

  rightAreaExpanded: true,
  rightAreaWidth: 650,
  rightSidebarWidth: 220,
  editorMaximized: false,
  toggleRightArea: () => set((s) => ({ rightAreaExpanded: !s.rightAreaExpanded })),
  setRightAreaWidth: (width) => set({ rightAreaWidth: width }),
  setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
  toggleEditorMaximized: () => set((s) => ({ editorMaximized: !s.editorMaximized })),

  modeEditorTabs: {
    manuscript: [],
    vault: [],
    zotero: [],
    chat: [],
    assets: [],
    other: [],
    code: [],
  },
  modeActiveEditorTab: {
    manuscript: null,
    vault: null,
    zotero: null,
    chat: null,
    assets: null,
    other: null,
    code: null,
  },

  openEditorTab: (tab) =>
    set((s) => {
      const mode = s.activeMode;
      const tabs = s.modeEditorTabs[mode];
      const exists = tabs.find((t) => t.id === tab.id);
      if (exists) {
        return {
          modeActiveEditorTab: { ...s.modeActiveEditorTab, [mode]: tab.id },
        };
      }
      return {
        modeEditorTabs: { ...s.modeEditorTabs, [mode]: [...tabs, tab] },
        modeActiveEditorTab: { ...s.modeActiveEditorTab, [mode]: tab.id },
      };
    }),

  closeEditorTab: (id) =>
    set((s) => {
      const mode = s.activeMode;
      const next = s.modeEditorTabs[mode].filter((t) => t.id !== id);
      return {
        modeEditorTabs: { ...s.modeEditorTabs, [mode]: next },
        modeActiveEditorTab: {
          ...s.modeActiveEditorTab,
          [mode]:
            s.modeActiveEditorTab[mode] === id
              ? (next[next.length - 1]?.id ?? null)
              : s.modeActiveEditorTab[mode],
        },
        editorMaximized: next.length === 0 ? false : s.editorMaximized,
      };
    }),

  setActiveEditorTab: (id) =>
    set((s) => ({
      modeActiveEditorTab: { ...s.modeActiveEditorTab, [s.activeMode]: id },
    })),
}));
