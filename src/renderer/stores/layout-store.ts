import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/debounced-storage";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  RIGHT_AREA_DEFAULT,
  SIDEBAR_RIGHT_DEFAULT,
} from "@/styles/constants";

export type AppMode = "all" | "manuscript" | "vault" | "zotero" | "code" | "assets" | "other" | "chat";
export type RightToolbarTab = "files" | "git" | "browser" | "texworkspace";
export type TexworkspaceViewMode = "split" | "tex" | "pdf";

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

  texworkspaceViewMode: TexworkspaceViewMode;
  setTexworkspaceViewMode: (mode: TexworkspaceViewMode) => void;

  leftSidebarOverlay: boolean;
  setLeftSidebarOverlay: (show: boolean) => void;
  leftSidebarView: "sessions" | "settings";
  setLeftSidebarView: (view: "sessions" | "settings") => void;
  settingsCategory: string;
  setSettingsCategory: (category: string) => void;

  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;

  sidebarExpanded: boolean;
  sidebarWidth: number;
  sidebarFullyCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarExpanded: (expanded: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarFullyCollapsed: (collapsed: boolean) => void;

  rightAreaExpanded: boolean;
  rightAreaWidth: number;
  rightSidebarWidth: number;
  editorMaximized: boolean;
  toggleRightArea: () => void;
  setRightAreaExpanded: (expanded: boolean) => void;
  setRightAreaWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  toggleEditorMaximized: () => void;
  setEditorMaximized: (maximized: boolean) => void;

  pinnedSessionIds: string[];
  pinnedExpanded: boolean;
  togglePinSession: (sessionId: string) => void;
  togglePinnedExpanded: () => void;

  sessionSort: "updated" | "created";
  setSessionSort: (sort: "updated" | "created") => void;

  archivedSessionIds: string[];
  showArchived: boolean;
  toggleArchiveSession: (sessionId: string) => void;
  toggleShowArchived: () => void;

  /** Breadcrumb navigation: set to a folder path to expand file tree to that location */
  fileTreeNavigatePath: string | null;
  setFileTreeNavigatePath: (path: string | null) => void;

  /** File tree: expand/collapse all folders toggle */
  fileTreeExpandAll: boolean;
  toggleFileTreeExpandAll: () => void;

  /** Outline panel visibility */
  outlineExpanded: boolean;
  setOutlineExpanded: (expanded: boolean) => void;

  /** Markdown preview width limit */
  mdWidthLimited: boolean;
  setMdWidthLimited: (limited: boolean) => void;

  /** Per-mode tabs (flat list) */
  modeEditorTabs: Record<AppMode, EditorTab[]>;
  modeActiveEditorTab: Record<AppMode, string | null>;
  openEditorTab: (tab: EditorTab) => void;
  closeEditorTab: (id: string) => void;
  setActiveEditorTab: (id: string) => void;
  createPdfTab: (name: string) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      activeMode: "chat",
      setActiveMode: (mode) => set({ activeMode: mode }),

      rightToolbarTab: "files",
      setRightToolbarTab: (tab) => set({ rightToolbarTab: tab }),

      texworkspaceViewMode: "split",
      setTexworkspaceViewMode: (mode) => set({ texworkspaceViewMode: mode }),

      leftSidebarOverlay: false,
      setLeftSidebarOverlay: (show) => set({ leftSidebarOverlay: show }),
      leftSidebarView: "sessions",
      setLeftSidebarView: (view) => set({ leftSidebarView: view }),
      settingsCategory: "general",
      setSettingsCategory: (category) => set({ settingsCategory: category }),

      rightSidebarOpen: false,
      toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
      setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),

      sidebarExpanded: true,
      sidebarWidth: SIDEBAR_LEFT_DEFAULT,
      sidebarFullyCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.min(width, SIDEBAR_LEFT_MAX) }),
      setSidebarFullyCollapsed: (collapsed) => set({ sidebarFullyCollapsed: collapsed }),

      rightAreaExpanded: false,
      rightAreaWidth: RIGHT_AREA_DEFAULT,
      rightSidebarWidth: SIDEBAR_RIGHT_DEFAULT,
      editorMaximized: false,
      toggleRightArea: () => set((s) => ({ rightAreaExpanded: !s.rightAreaExpanded })),
      setRightAreaExpanded: (expanded) => set({ rightAreaExpanded: expanded }),
      setRightAreaWidth: (width) => set({ rightAreaWidth: width }),
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
      toggleEditorMaximized: () => set((s) => ({ editorMaximized: !s.editorMaximized })),
      setEditorMaximized: (maximized) => set({ editorMaximized: maximized }),

      pinnedSessionIds: [],
      pinnedExpanded: true,
      togglePinSession: (sessionId) => set((s) => {
        const idx = s.pinnedSessionIds.indexOf(sessionId);
        if (idx >= 0) {
          return { pinnedSessionIds: s.pinnedSessionIds.filter((id) => id !== sessionId) };
        }
        return { pinnedSessionIds: [...s.pinnedSessionIds, sessionId] };
      }),
      togglePinnedExpanded: () => set((s) => ({ pinnedExpanded: !s.pinnedExpanded })),

      archivedSessionIds: [],
      showArchived: false,
      toggleArchiveSession: (sessionId) => set((s) => {
        const idx = s.archivedSessionIds.indexOf(sessionId);
        if (idx >= 0) {
          return { archivedSessionIds: s.archivedSessionIds.filter((id) => id !== sessionId) };
        }
        return {
          archivedSessionIds: [...s.archivedSessionIds, sessionId],
          pinnedSessionIds: s.pinnedSessionIds.filter((id) => id !== sessionId),
        };
      }),
      toggleShowArchived: () => set((s) => ({ showArchived: !s.showArchived })),

      fileTreeNavigatePath: null,
      setFileTreeNavigatePath: (path) => set({ fileTreeNavigatePath: path }),

      fileTreeExpandAll: true,
      toggleFileTreeExpandAll: () => set((s) => ({ fileTreeExpandAll: !s.fileTreeExpandAll })),

      outlineExpanded: true,
      setOutlineExpanded: (expanded) => set({ outlineExpanded: expanded }),

      mdWidthLimited: true,
      setMdWidthLimited: (limited) => set({ mdWidthLimited: limited }),

      sessionSort: "updated",
      setSessionSort: (sessionSort) => set({ sessionSort }),

      modeEditorTabs: {
        all: [],
        manuscript: [],
        vault: [],
        zotero: [],
        chat: [],
        assets: [],
        other: [],
        code: [],
      },
      modeActiveEditorTab: {
        all: null,
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
    }),
    {
      name: "prism-next-layout",
      storage: createJSONStorage(() => createDebouncedStorage()),
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        rightSidebarWidth: state.rightSidebarWidth,
        rightAreaWidth: state.rightAreaWidth,
        pinnedSessionIds: state.pinnedSessionIds,
        archivedSessionIds: state.archivedSessionIds,
        sessionSort: state.sessionSort,
      }),
    },
  ),
);
