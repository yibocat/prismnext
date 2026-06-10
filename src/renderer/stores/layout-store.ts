import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/debounced-storage";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  RIGHT_AREA_DEFAULT,
  SIDEBAR_RIGHT_DEFAULT,
} from "@/styles/constants";

/** App mode — "all", "manuscript", "chat", or any project subdirectory name. */
export type AppMode = string;
/**
 * Toolbar mode identifiers. These MUST match the `id` fields of registered
 * ModeDefinition entries in modeRegistry. The dashboard sentinel is the only
 * value not backed by a ModeDefinition — it represents "no mode active."
 */
export type RightToolbarTab = "dashboard" | "files" | "git" | "browser" | "texworkspace" | "terminal";
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

  /** Modes that are currently toggled on (can be multiple simultaneously) */
  activeModes: RightToolbarTab[];
  /** Which mode's content + sidebar is currently visible */
  focusedMode: RightToolbarTab | "dashboard";
  /** Activate a mode (add to activeModes) and focus it */
  activateMode: (mode: RightToolbarTab) => void;
  /** Deactivate a mode (remove from activeModes), auto-focus next or dashboard */
  deactivateMode: (mode: RightToolbarTab) => void;
  /** Toggle: activate+focus if off; deactivate if on-and-focused; focus if on-but-not-focused */
  toggleMode: (mode: RightToolbarTab) => void;
  /** Switch focus to a different active mode */
  setFocusedMode: (mode: RightToolbarTab | "dashboard") => void;

  texworkspaceViewMode: TexworkspaceViewMode;
  setTexworkspaceViewMode: (mode: TexworkspaceViewMode) => void;
  texworkspaceSearchQuery: string;
  setTexworkspaceSearchQuery: (query: string) => void;

  leftSidebarOverlay: boolean;
  setLeftSidebarOverlay: (show: boolean) => void;
  leftSidebarView: "sessions" | "settings" | "templates";
  setLeftSidebarView: (view: "sessions" | "settings" | "templates") => void;
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

  /** Persisted set of expanded folder paths in the file tree sidebar */
  expandedFileTreeFolders: string[];
  setExpandedFileTreeFolders: (folders: string[]) => void;

  /** Outline panel visibility */
  outlineExpanded: boolean;
  setOutlineExpanded: (expanded: boolean) => void;

  /** Markdown preview width limit */
  mdWidthLimited: boolean;
  setMdWidthLimited: (limited: boolean) => void;

  /** Per-mode tabs (flat list) */
  modeEditorTabs: Record<string, EditorTab[]>;
  modeActiveEditorTab: Record<string, string | null>;
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

      activeModes: [],
      focusedMode: "dashboard",

      activateMode: (mode) =>
        set((s) => ({
          activeModes: s.activeModes.includes(mode) ? s.activeModes : [...s.activeModes, mode],
          focusedMode: mode,
        })),

      deactivateMode: (mode) =>
        set((s) => {
          const next = s.activeModes.filter((m) => m !== mode);
          return {
            activeModes: next,
            focusedMode:
              s.focusedMode === mode
                ? next.length > 0
                  ? next[next.length - 1]
                  : "dashboard"
                : s.focusedMode,
          };
        }),

      toggleMode: (mode) =>
        set((s) => {
          if (!s.activeModes.includes(mode)) {
            // Not active → activate + focus
            return {
              activeModes: [...s.activeModes, mode],
              focusedMode: mode,
            };
          } else if (s.focusedMode === mode) {
            // Active and focused → deactivate
            const next = s.activeModes.filter((m) => m !== mode);
            return {
              activeModes: next,
              focusedMode: next.length > 0 ? next[next.length - 1] : "dashboard",
            };
          } else {
            // Active but not focused → just focus
            return { focusedMode: mode };
          }
        }),

      setFocusedMode: (mode) => set({ focusedMode: mode }),

      texworkspaceViewMode: "split",
      texworkspaceSearchQuery: "",
      setTexworkspaceViewMode: (mode) => set({ texworkspaceViewMode: mode }),
      setTexworkspaceSearchQuery: (query) => set({ texworkspaceSearchQuery: query }),

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

      expandedFileTreeFolders: [],
      setExpandedFileTreeFolders: (folders) => set({ expandedFileTreeFolders: folders }),

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
        expandedFileTreeFolders: state.expandedFileTreeFolders,
      }),
    },
  ),
);
