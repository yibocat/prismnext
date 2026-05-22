import { create } from "zustand";
import {
  SIDEBAR_LEFT_DEFAULT,
  RIGHT_AREA_DEFAULT,
  SIDEBAR_RIGHT_DEFAULT,
} from "@/styles/constants";

export type AppMode = "all" | "manuscript" | "vault" | "zotero" | "code" | "assets" | "other" | "chat";
export type RightToolbarTab = "files" | "git" | "browser";

export type TabType = "file" | "pdf";

export interface EditorTab {
  id: string;
  name: string;
  type: TabType;
}

interface LayoutState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;

  rightToolbarTab: RightToolbarTab;
  setRightToolbarTab: (tab: RightToolbarTab) => void;

  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;

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

  /** Per-mode tabs (flat list) */
  modeEditorTabs: Record<AppMode, EditorTab[]>;
  modeActiveEditorTab: Record<AppMode, string | null>;
  openEditorTab: (tab: EditorTab) => void;
  closeEditorTab: (id: string) => void;
  setActiveEditorTab: (id: string) => void;
  createPdfTab: (name: string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeMode: "chat",
  setActiveMode: (mode) =>
    set((s) => ({
      activeMode: mode,
      editorMaximized:
        s.editorMaximized && (s.modeEditorTabs[mode]?.length ?? 0) === 0
          ? false
          : s.editorMaximized,
    })),

  rightToolbarTab: "files",
  setRightToolbarTab: (tab) => set({ rightToolbarTab: tab }),

  rightSidebarOpen: false,
  toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),

  sidebarExpanded: true,
  sidebarWidth: SIDEBAR_LEFT_DEFAULT,
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  rightAreaExpanded: false,
  rightAreaWidth: RIGHT_AREA_DEFAULT,
  rightSidebarWidth: SIDEBAR_RIGHT_DEFAULT,
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
        return { modeActiveEditorTab: { ...s.modeActiveEditorTab, [mode]: tab.id } };
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

  createPdfTab: (name) =>
    set((s) => {
      const mode = s.activeMode;
      const tabs = s.modeEditorTabs[mode];
      const pdfTab: EditorTab = { id: `pdf:${Date.now()}`, name, type: "pdf" };
      return {
        modeEditorTabs: { ...s.modeEditorTabs, [mode]: [...tabs, pdfTab] },
        modeActiveEditorTab: { ...s.modeActiveEditorTab, [mode]: pdfTab.id },
      };
    }),
}));
