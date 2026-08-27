import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createDebouncedStorage } from "@/lib/debounced-storage";
import {
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_MAX,
  RIGHT_AREA_DEFAULT,
  SIDEBAR_RIGHT_DEFAULT,
} from "@/styles/constants";
import type { SessionStatusFilter } from "@/lib/chat/session-status";

/** App mode — "all", "manuscript", "chat", or any project subdirectory name. */
export type AppMode = string;
/**
 * Toolbar mode identifiers (RightArea mode ids). Match ModeDefinition.id.
 * Named historically; not a writable “toolbar toggle” store.
 * Sentinel `"dashboard"` means no focused mode (no active tab).
 */
export type RightToolbarTab =
  | "dashboard"
  | "files"
  | "research-plan"
  | "git"
  | "browser"
  | "texworkspace"
  | "terminal"
  | "literature"
  | "experiments"
  | "interaction";
export type TexworkspaceViewMode = "split" | "tex" | "pdf";

export type TabType = "file" | "pdf";

export type LeftSidebarView = "sessions" | "settings" | "templates" | "teams";

export interface EditorTab {
  id: string;
  name: string;
  type: TabType;
}

interface LayoutState {
  activeMode: AppMode;
  setActiveMode: (mode: AppMode) => void;

  /**
   * RightArea “which modes are open / focused” is **not** stored here.
   * Derive from `right-panel-store.tabs` + `activeTabId` via
   * `modes-from-tabs.ts` (`activeModeIds` / `focusedModeId` / `hasMode`).
   */

  texworkspaceViewMode: TexworkspaceViewMode;
  setTexworkspaceViewMode: (mode: TexworkspaceViewMode) => void;
  /** Default layout applied when entering TeX Workspace. */
  texworkspaceDefaultViewMode: TexworkspaceViewMode;
  setTexworkspaceDefaultViewMode: (mode: TexworkspaceViewMode) => void;
  /**
   * When true, TeX split shows editor on the left and compile PDF on the right
   * (default is PDF left / editor right).
   */
  texworkspacePanesSwapped: boolean;
  setTexworkspacePanesSwapped: (swapped: boolean) => void;
  toggleTexworkspacePanesSwapped: () => void;
  /** When true, the PDF preview slot shows compile problems (texworkspace only). */
  texworkspaceProblemsOpen: boolean;
  setTexworkspaceProblemsOpen: (open: boolean) => void;
  texworkspaceSearchQuery: string;
  setTexworkspaceSearchQuery: (query: string) => void;

  /** 中间主区域当前视图；centerView 型导航项激活时写入，见 left-nav/items.tsx */
  leftSidebarView: LeftSidebarView;
  setLeftSidebarView: (view: LeftSidebarView) => void;
  /** Set when settings/templates collapse the right area; restored on exit unless cleared. */
  pendingRightAreaRestore: boolean;
  setPendingRightAreaRestore: (pending: boolean) => void;
  clearPendingRightAreaRestore: () => void;
  /** Workspace RightArea tab to restore after leaving Settings (ephemeral). */
  workspaceActiveTabIdBeforeSettings: string | null;
  setWorkspaceActiveTabIdBeforeSettings: (id: string | null) => void;
  settingsCategory: string;
  setSettingsCategory: (category: string) => void;

  /** Settings detail fills main area when window is too narrow for split view. */
  settingsDetailStacked: boolean;
  setSettingsDetailStacked: (stacked: boolean) => void;

  /** Ephemeral — not persisted. */
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  rightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  /**
   * Bumped to ask RightArea to open the mode sidebar once the container has
   * a real width (split when roomy, full overlay when narrow) — avoids races
   * where setRightSidebarOpen(true) is immediately auto-closed at width 0.
   */
  rightSidebarRevealNonce: number;
  revealRightSidebar: () => void;

  sidebarWidth: number;
  /** User toggle intent — window-fold must not clear this. */
  leftUserExpanded: boolean;
  /** Folded to 0 because the window was too narrow. */
  leftWindowCollapsed: boolean;
  /** After a window-fold, restore stays at 280 until the sash writes a width. */
  leftPinToMin: boolean;
  setSidebarWidth: (width: number) => void;
  setLeftUserExpanded: (expanded: boolean) => void;
  setLeftWindowCollapsed: (collapsed: boolean) => void;
  setLeftPinToMin: (pin: boolean) => void;

  rightAreaExpanded: boolean;
  rightAreaWidth: number;
  /** User-resized width for Settings detail panel (split mode) — separate from workspace RightArea. */
  settingsDetailWidth: number;
  setSettingsDetailWidth: (width: number) => void;
  /** Incremented to programmatically expand the RightArea panel when collapsed (e.g. open Browser link). */
  rightAreaExpandNonce: number;
  /** Expand RightArea only if collapsed; does not reset width when already open. */
  requestRightAreaExpand: () => void;
  /** Incremented to close the settings detail editor (collapse + clear slot). */
  settingsDetailCloseNonce: number;
  requestCloseSettingsDetailPanel: () => void;
  /** Incremented to focus the AiBar composer when editor is maximized. */
  aiBarComposerFocusNonce: number;
  requestAiBarComposerFocus: () => void;
  rightSidebarWidth: number;
  editorMaximized: boolean;
  setRightAreaExpanded: (expanded: boolean) => void;
  setRightAreaWidth: (width: number) => void;
  setRightSidebarWidth: (width: number) => void;
  setEditorMaximized: (maximized: boolean) => void;

  pinnedSessionIds: string[];
  pinnedExpanded: boolean;
  togglePinSession: (sessionId: string) => void;
  togglePinnedExpanded: () => void;

  /**
   * Workbench folder expand set. `null` = never toggled (only the focused
   * project starts open). `[]` = user collapsed every folder.
   */
  expandedWorkbenchProjectIds: string[] | null;
  setExpandedWorkbenchProjectIds: (ids: string[] | null) => void;

  sessionSort: "updated" | "created";
  setSessionSort: (sort: "updated" | "created") => void;

  sessionGroupBy: "workbench" | "updated";
  setSessionGroupBy: (groupBy: "workbench" | "updated") => void;

  sessionStatusFilter: SessionStatusFilter;
  setSessionStatusFilter: (filter: SessionStatusFilter) => void;

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

  /** Persisted percent layout for WorkspaceSplit groups keyed by `{leftId}:{rightId}`. */
  workspaceSplitLayouts: Record<string, Record<string, number>>;
  setWorkspaceSplitLayout: (key: string, layout: Record<string, number>) => void;

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

      texworkspaceViewMode: "split",
      texworkspaceDefaultViewMode: "split",
      setTexworkspaceDefaultViewMode: (mode) => set({ texworkspaceDefaultViewMode: mode }),
      texworkspacePanesSwapped: false,
      setTexworkspacePanesSwapped: (swapped) => set({ texworkspacePanesSwapped: swapped }),
      toggleTexworkspacePanesSwapped: () =>
        set((s) => ({ texworkspacePanesSwapped: !s.texworkspacePanesSwapped })),
      texworkspaceProblemsOpen: false,
      setTexworkspaceProblemsOpen: (open) => set({ texworkspaceProblemsOpen: open }),
      texworkspaceSearchQuery: "",
      setTexworkspaceViewMode: (mode) =>
        set({
          texworkspaceViewMode: mode,
          texworkspaceProblemsOpen: false,
        }),
      setTexworkspaceSearchQuery: (query) => set({ texworkspaceSearchQuery: query }),

      leftSidebarView: "sessions",
      setLeftSidebarView: (view) => set({ leftSidebarView: view }),
      pendingRightAreaRestore: false,
      setPendingRightAreaRestore: (pending) => set({ pendingRightAreaRestore: pending }),
      clearPendingRightAreaRestore: () => set({ pendingRightAreaRestore: false }),
      workspaceActiveTabIdBeforeSettings: null,
      setWorkspaceActiveTabIdBeforeSettings: (id) =>
        set({ workspaceActiveTabIdBeforeSettings: id }),
      settingsCategory: "general",
      setSettingsCategory: (category) => set({ settingsCategory: category }),

      settingsDetailStacked: false,
      setSettingsDetailStacked: (stacked) =>
        set((s) => (s.settingsDetailStacked === stacked ? s : { settingsDetailStacked: stacked })),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) =>
        set((s) => (s.commandPaletteOpen === open ? s : { commandPaletteOpen: open })),

      rightSidebarOpen: false,
      rightSidebarRevealNonce: 0,
      toggleRightSidebar: () => set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
      setRightSidebarOpen: (open) => set({ rightSidebarOpen: open }),
      revealRightSidebar: () =>
        set((s) => ({
          rightSidebarOpen: true,
          rightSidebarRevealNonce: s.rightSidebarRevealNonce + 1,
        })),

      sidebarWidth: SIDEBAR_LEFT_DEFAULT,
      leftUserExpanded: true,
      leftWindowCollapsed: false,
      leftPinToMin: false,
      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(Math.max(width, SIDEBAR_LEFT_MIN), SIDEBAR_LEFT_MAX),
          leftPinToMin: false,
        }),
      setLeftUserExpanded: (expanded) => set({ leftUserExpanded: expanded }),
      setLeftWindowCollapsed: (collapsed) => set({ leftWindowCollapsed: collapsed }),
      setLeftPinToMin: (pin) => set({ leftPinToMin: pin }),

      rightAreaExpanded: false,
      rightAreaWidth: RIGHT_AREA_DEFAULT,
      settingsDetailWidth: RIGHT_AREA_DEFAULT,
      rightAreaExpandNonce: 0,
      requestRightAreaExpand: () =>
        set((s) => ({ rightAreaExpandNonce: s.rightAreaExpandNonce + 1, rightAreaExpanded: true })),
      settingsDetailCloseNonce: 0,
      requestCloseSettingsDetailPanel: () =>
        set((s) => ({ settingsDetailCloseNonce: s.settingsDetailCloseNonce + 1 })),
      aiBarComposerFocusNonce: 0,
      requestAiBarComposerFocus: () =>
        set((s) => ({ aiBarComposerFocusNonce: s.aiBarComposerFocusNonce + 1 })),
      rightSidebarWidth: SIDEBAR_RIGHT_DEFAULT,
      editorMaximized: false,
      setRightAreaExpanded: (expanded) =>
        set((s) => (s.rightAreaExpanded === expanded ? s : { rightAreaExpanded: expanded })),
      setRightAreaWidth: (width) => set({ rightAreaWidth: width }),
      setSettingsDetailWidth: (width) => set({ settingsDetailWidth: width }),
      setRightSidebarWidth: (width) => set({ rightSidebarWidth: width }),
      setEditorMaximized: (maximized) =>
        set((s) => (s.editorMaximized === maximized ? s : { editorMaximized: maximized })),

      expandedWorkbenchProjectIds: null,
      setExpandedWorkbenchProjectIds: (ids) => set({ expandedWorkbenchProjectIds: ids }),

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

      workspaceSplitLayouts: {},
      setWorkspaceSplitLayout: (key, layout) =>
        set((s) => ({
          workspaceSplitLayouts: { ...s.workspaceSplitLayouts, [key]: layout },
        })),

      sessionSort: "updated",
      setSessionSort: (sessionSort) => set({ sessionSort }),
      sessionGroupBy: "workbench",
      setSessionGroupBy: (sessionGroupBy) => set({ sessionGroupBy }),
      sessionStatusFilter: "all",
      setSessionStatusFilter: (sessionStatusFilter) => set({ sessionStatusFilter }),

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
        settingsDetailWidth: state.settingsDetailWidth,
        sessionSort: state.sessionSort,
        sessionGroupBy: state.sessionGroupBy,
        sessionStatusFilter: state.sessionStatusFilter,
        pinnedExpanded: state.pinnedExpanded,
        expandedWorkbenchProjectIds: state.expandedWorkbenchProjectIds,
        expandedFileTreeFolders: state.expandedFileTreeFolders,
        texworkspaceDefaultViewMode: state.texworkspaceDefaultViewMode,
        texworkspacePanesSwapped: state.texworkspacePanesSwapped,
        workspaceSplitLayouts: state.workspaceSplitLayouts,
      }),
    },
  ),
);
