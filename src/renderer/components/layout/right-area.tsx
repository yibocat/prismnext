import { useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import { type PanelImperativeHandle } from "react-resizable-panels";
import { useLayoutStore, type RightToolbarTab } from "@/stores/layout-store";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { modeRegistry, type RightTab } from "@/lib/workspace/mode-registry";
import { useWindowState } from "@/hooks/use-window-state";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import { useRightAreaShortcuts } from "@/hooks/use-right-area-shortcuts";
import { tabDisplayTitle } from "@/lib/workspace/tab-lifecycle";
import { SidebarControls } from "@/components/layout/sidebar-controls";
import { ServerStatusDot } from "@/components/server-status-dot";
import { TabToolbar } from "@/components/layout/tab-toolbar";

import { useBrowserStore } from "@/stores/browser-store";
import { useTerminalStore } from "@/stores/terminal-store";
import { useGitStore } from "@/stores/git-store";
import { scheduleGitStatusRefresh } from "@/lib/git/checkout-context";
import { AiBar } from "@/components/modules/chat";
import {
  PanelRight,
  MaximizeIcon,
  MinimizeIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
  ArrowLeftIcon,
} from "lucide-react";
import {
  computeEffectiveSidebarWidth,
  shouldAutoCloseSplitSidebar,
  shouldExitFullMode,
  canAutoOpenSplitSidebar,
  RIGHT_AREA_SPLIT_THRESHOLD,
} from "@/lib/workspace/right-area-sidebar-layout";
import { SIDEBAR_RIGHT_MIN, SIDEBAR_RIGHT_MAX } from "@/styles/constants";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { ChevronsLeftRightEllipsisIcon, LayoutGridIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveSettingsEditorSlot } from "@/hooks/use-settings-editor";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";
import { closeSettingsDetailPanel } from "@/lib/workspace/expand-settings-detail-panel";

interface RightAreaProps {
  leftSidebarRef: RefObject<PanelImperativeHandle | null>;
  centerRef: RefObject<PanelImperativeHandle | null>;
  rightAreaRef: RefObject<PanelImperativeHandle | null>;
}

const TITLEBAR_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors";

function SidebarDragHandle({
  onResize,
  getStartWidth,
  isDraggingRef,
  onDragChange,
}: {
  onResize: (width: number) => void;
  /** Visible sidebar width when drag begins (may be squeezed below stored preference). */
  getStartWidth: () => number;
  isDraggingRef?: React.MutableRefObject<boolean>;
  onDragChange?: (dragging: boolean) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = getStartWidth();

      if (isDraggingRef) isDraggingRef.current = true;
      if (onDragChange) onDragChange(true);

      let rafId: number | null = null;
      const latestEventRef = { current: null as MouseEvent | null };

      const onMouseMove = (ev: MouseEvent) => {
        latestEventRef.current = ev;
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const latest = latestEventRef.current;
          if (latest) {
            onResize(startWidth - (latest.clientX - startX));
          }
        });
      };

      const onMouseUp = () => {
        if (isDraggingRef) isDraggingRef.current = false;
        if (onDragChange) onDragChange(false);
        if (rafId !== null) cancelAnimationFrame(rafId);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [onResize, getStartWidth, isDraggingRef, onDragChange],
  );

  return (
    <div
      className="w-px bg-border hover:bg-foreground/30 transition-colors cursor-col-resize shrink-0 relative group"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

export function RightArea({
  leftSidebarRef,
  centerRef,
  rightAreaRef,
}: RightAreaProps) {
  return (
    <RightAreaWorkspace
      leftSidebarRef={leftSidebarRef}
      centerRef={centerRef}
      rightAreaRef={rightAreaRef}
    />
  );
}

function RightAreaWorkspace({
  leftSidebarRef,
  centerRef,
  rightAreaRef,
}: RightAreaProps) {
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMac = platform === "darwin";

  const sidebarFullyCollapsed = useLayoutStore((s) => s.sidebarFullyCollapsed);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const activeModes = useLayoutStore((s) => s.activeModes);
  const focusedMode = useLayoutStore((s) => s.focusedMode);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
  const toggleMode = useLayoutStore((s) => s.toggleMode);
  const activateMode = useLayoutStore((s) => s.activateMode);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useLayoutStore((s) => s.setRightSidebarOpen);
  const rightSidebarWidth = useLayoutStore((s) => s.rightSidebarWidth);
  const setRightSidebarWidth = useLayoutStore((s) => s.setRightSidebarWidth);
  const settingsSlot = useActiveSettingsEditorSlot();
  const hasSettingsEditorTab = useRightPanelStore((s) =>
    s.tabs.some((t) => t.kind === "settings-editor"),
  );
  const inSettings = leftSidebarView === "settings";
  const settingsEditorOpen = hasSettingsEditorTab;
  const showSettingsStackedChrome =
    inSettings && settingsDetailStacked && settingsEditorOpen;
  const toolbarModes = useMemo(
    () => modeRegistry.getToolbarModes(inSettings ? "settings" : "workspace"),
    [inSettings],
  );
  const prevCategoryRef = useRef(settingsCategory);

  const slotTitle = settingsPanelSlotTitle(settingsSlot);
  const stackedToolbarTitle = slotTitle ?? (settingsSlot ? "Editor" : "Settings editor");

  useEffect(() => {
    if (!inSettings) return;
    if (prevCategoryRef.current === settingsCategory) return;
    prevCategoryRef.current = settingsCategory;
    closeSettingsDetailPanel(centerRef.current, rightAreaRef.current);
  }, [inSettings, settingsCategory, centerRef, rightAreaRef]);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isEditorKind = activeTab?.kind === "file" || activeTab?.kind === "texworkspace";
  const isSettingsEditorTab = activeTab?.kind === "settings-editor";
  const showTabToolbar =
    activeTab &&
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab;
  const showModeSidebar =
    rightSidebarOpen &&
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab;

  const closeSettingsPanel = () => {
    closeSettingsDetailPanel(centerRef.current, rightAreaRef.current);
  };

  const projectRoot = useDocumentStore((s) => s.projectRoot);

  // Initialize browser store when project opens
  useEffect(() => {
    if (projectRoot) {
      useBrowserStore.getState().loadFromProject(projectRoot);
    }
  }, [projectRoot]);

  // Initialize terminal store when project opens
  useEffect(() => {
    if (projectRoot) {
      useTerminalStore.getState().loadFromProject(projectRoot);
      useTerminalStore.getState().fetchEnvInfo();
    }
  }, [projectRoot]);

  // ── File watcher: start when checkout root changes (project open OR worktree switch) ──
  const checkoutRoot = useDocumentStore((s) => s.checkoutRoot);

  // Initialize / sync git store when project opens or checkout root changes
  // (e.g. switching between worktree and project views in the Files panel).
  useEffect(() => {
    const root = checkoutRoot || projectRoot;
    if (root) {
      useGitStore.getState().selectUnit(root);
    } else {
      useGitStore.getState().clearAll();
    }
  }, [projectRoot, checkoutRoot]);

  useEffect(() => {
    if (checkoutRoot) {
      window.electronAPI.fsWatchStart(checkoutRoot).catch((err) => {
        console.error("[watcher] Failed to start file watcher:", err);
      });
    }
    return () => {
      window.electronAPI.fsWatchStop().catch((err) => {
        console.error("[watcher] Failed to stop file watcher:", err);
      });
    };
  }, [checkoutRoot]);

  // ── File watcher: reload files AND refresh git when external changes detected ──
  useEffect(() => {
    const unsubscribe = window.electronAPI.onFileChanged(({ changedPaths }) => {
      if (changedPaths && changedPaths.length > 0) {
        // Incremental: only reload the specific files that changed
        useDocumentStore.getState().incrementalFileChanged(changedPaths);
      } else {
        // Fallback: full metadata reload (mass directory changes)
        useDocumentStore.getState().reloadMetadataFromDisk();
      }

      scheduleGitStatusRefresh();
    });
    return unsubscribe;
  }, []);

  // Subscribe to a lightweight version counter instead of the full Map —
  // avoids RightArea re-rendering on every keystroke in any editor.
  const dirtyVersion = useDocumentStore((s) => s.dirtyVersion);
  const dirtyFileIds = useMemo(() => {
    const dirty = new Set<string>();
    useDocumentStore.getState().openedContents.forEach((v, k) => { if (v.isDirty) dirty.add(k); });
    return dirty;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyVersion]);

  // Stable TabBar callbacks — prevents memo break
  const handleTabSelect = useCallback(
    (id: string) => {
      const store = useRightPanelStore.getState();
      store.setActiveTab(id);
      // Sync focusedMode to match the clicked tab
      const tab = store.tabs.find((t) => t.id === id);
      if (tab && tab.kind !== "settings-editor") {
        const def = modeRegistry.findByTabKind(tab.kind);
        if (def) useLayoutStore.getState().setFocusedMode(def.id as RightToolbarTab);
      }
    }, []);
  const handleTabClose = useCallback(
    (id: string) => useRightPanelStore.getState().requestCloseTab(id), []);
  const handleTabPin = useCallback(
    (id: string) => useRightPanelStore.getState().pinTab(id), []);
  const handleTabReorder = useCallback(
    (from: number, to: number) => useRightPanelStore.getState().moveTab(from, to), []);

  useRightAreaShortcuts(rightAreaExpanded && focusedMode !== "dashboard");

  // Same pattern as App.tsx Panel onResize:
  //   - Only save width when >= 30px (preserve last real width on collapse)
  //   - Close sidebar when width drops below 30px
  const COLLAPSE_THRESHOLD = 30;

  const isDraggingSidebar = useRef(false);
  const [sidebarDragActive, setSidebarDragActive] = useState(false);
  const containerElRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sidebarFullMode, setSidebarFullMode] = useState(false);
  const sidebarFullModeRef = useRef(false);
  useEffect(() => {
    sidebarFullModeRef.current = sidebarFullMode;
  }, [sidebarFullMode]);

  const getSidebarDragStartWidth = useCallback(() => {
    const preferred = useLayoutStore.getState().rightSidebarWidth;
    if (sidebarFullModeRef.current) return preferred;
    const cw = containerElRef.current?.clientWidth ?? 0;
    if (cw <= 0) return preferred;
    return computeEffectiveSidebarWidth(cw, preferred);
  }, []);

  const handleSidebarResize = useCallback((width: number) => {
    const st = useLayoutStore.getState();
    if (width >= COLLAPSE_THRESHOLD) {
      const clamped = Math.max(SIDEBAR_RIGHT_MIN, Math.min(SIDEBAR_RIGHT_MAX, width));
      st.setRightSidebarWidth(clamped);
      if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      if (sidebarFullModeRef.current) setSidebarFullMode(false);
    } else if (st.rightSidebarOpen) {
      st.setRightSidebarOpen(false);
    }
  }, []);

  const sidebarElRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sidebarEl = sidebarElRef.current;
    if (!sidebarEl) return;

    const observer = new ResizeObserver((entries) => {
      if (isDraggingSidebar.current) return;
      if (sidebarFullModeRef.current) return;

      const actualWidth = Math.round(entries[0].contentRect.width);
      if (actualWidth <= 0) return;
      const st = useLayoutStore.getState();
      if (actualWidth >= COLLAPSE_THRESHOLD) {
        st.setRightSidebarWidth(Math.max(SIDEBAR_RIGHT_MIN, actualWidth));
        if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      } else if (st.rightSidebarOpen) {
        st.setRightSidebarOpen(false);
      }
    });
    observer.observe(sidebarEl);
    return () => observer.disconnect();
  }, []);

  const isTooNarrowForSplit = useCallback((width: number) => {
    return width > 0 && width < RIGHT_AREA_SPLIT_THRESHOLD;
  }, []);

  // Reactively squeeze split sidebar, then close when container shrinks past threshold.
  useEffect(() => {
    const el = containerElRef.current;
    if (!el) return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const w = el.clientWidth;
        setContainerWidth(w);
        if (w <= 0) return;

        if (shouldAutoCloseSplitSidebar(w, sidebarFullModeRef.current)) {
          const st = useLayoutStore.getState();
          if (st.rightSidebarOpen) {
            st.setRightSidebarOpen(false);
          }
          setSidebarFullMode(false);
          return;
        }

        if (shouldExitFullMode(w)) {
          setSidebarFullMode((prev) => (prev ? false : prev));
        }
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleToggleSidebar = useCallback(() => {
    const st = useLayoutStore.getState();
    if (st.rightSidebarOpen) {
      setSidebarFullMode(false);
      st.setRightSidebarOpen(false);
    } else {
      const cw = containerElRef.current?.clientWidth ?? Infinity;
      if (isFinite(cw)) setContainerWidth(cw);
      if (isTooNarrowForSplit(cw)) setSidebarFullMode(true);
      st.setRightSidebarOpen(true);
    }
  }, [isTooNarrowForSplit]);

  // ── Mode button: per-mode lifecycle (registry-driven) ──
  const handleModeClick = useCallback(
    (target: string) => {
      const store = useRightPanelStore.getState();
      const active = activeModes.includes(target as RightToolbarTab);
      const def = modeRegistry.get(target);

      if (!active) {
        // ── Activate mode ──
        activateMode(target as RightToolbarTab);
        if (def) {
          // Terminal is special: only create PTY if no sessions exist
          if (target === "terminal" && store.hasTabsOfKind("terminal")) {
            // reuse existing terminal tab
          } else {
            const kind = def.tabKinds[0];
            if (kind) {
              if (target === "terminal") {
                store.newTerminalTab();
              } else {
                store.ensureTab(kind);
              }
            }
          }
          def.onActivate?.();
        }
        // Auto-open sidebar only when there is room for sidebar + content.
        if (!compactModesRef.current) {
          const cw = containerElRef.current?.clientWidth ?? Infinity;
          if (isFinite(cw)) setContainerWidth(cw);
          if (canAutoOpenSplitSidebar(cw)) {
            setRightSidebarOpen(true);
            setSidebarFullMode(false);
          }
        }
      } else if (focusedMode === target) {
        // ── Deactivate mode → close ALL its tabs → Dashboard ──
        if (def) {
          const kinds = def.tabKinds;
          const finishDeactivate = () => {
            def.onDeactivate?.();
            toggleMode(target as RightToolbarTab);
            const newFocused = useLayoutStore.getState().focusedMode;
            if (newFocused !== "dashboard") {
              const newDef = modeRegistry.get(newFocused);
              const newTab = useRightPanelStore.getState().tabs.find((t) =>
                newDef?.tabKinds.includes(t.kind),
              );
              if (newTab) useRightPanelStore.getState().setActiveTab(newTab.id);
            }
          };
          const closeKindAt = (index: number) => {
            if (index >= kinds.length) {
              finishDeactivate();
              return;
            }
            store.closeTabsOfKind(kinds[index], {
              onClosed: () => closeKindAt(index + 1),
            });
          };
          closeKindAt(0);
        } else {
          toggleMode(target as RightToolbarTab);
        }
      } else {
        // ── Switch focus (active but not focused) ──
        toggleMode(target as RightToolbarTab);
        const tab = store.tabs.find(
          (t) => def?.tabKinds.includes(t.kind),
        );
        if (tab) store.setActiveTab(tab.id);
      }
    },
    [activeModes, focusedMode, activateMode, toggleMode, setRightSidebarOpen],
  );

  const sidebarFull = rightSidebarOpen && sidebarFullMode;

  const effectiveSidebarWidth = useMemo(() => {
    if (sidebarFull || containerWidth <= 0) return rightSidebarWidth;
    return computeEffectiveSidebarWidth(containerWidth, rightSidebarWidth);
  }, [sidebarFull, rightSidebarWidth, containerWidth]);

  // ── Tab overflow detection ──
  const tabBarContainerRef = useRef<HTMLDivElement>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const tabsOverflowRef = useRef(false);
  useEffect(() => {
    const el = tabBarContainerRef.current;
    if (!el) return;
    const check = () => {
      const ov = tabs.length > 0 && el.clientWidth < tabs.length * 126;
      tabsOverflowRef.current = ov;
      setTabsOverflow(ov);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tabs.length]);

  // ─── Responsive: collapse mode buttons into dropdown on narrow windows ───
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compactModes, setCompactModes] = useState(false);
  const compactModesRef = useRef(false);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const check = () => {
      const c = el.clientWidth < 500;
      compactModesRef.current = c;
      setCompactModes(c);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col min-w-0" data-surface="content" data-right-area>
      {showSettingsStackedChrome ? (
        <div
          className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center gap-0.5 select-none px-2 min-w-0"
          data-surface="content"
        >
          <div className="flex items-center gap-0.5 shrink-0">
            {sidebarFullyCollapsed ? (
              <SidebarControls
                leftSidebarRef={leftSidebarRef}
                showMacSpacer={isMac && !isFullscreen}
                className="-ml-[1px]"
              />
            ) : (
              isMac && !isFullscreen && <div className="w-[68px]" />
            )}
          </div>
          <div className="flex items-center min-w-0 gap-1 ml-0.5 shrink-0">
            <button
              type="button"
              className={TITLEBAR_BTN}
              title="Back to settings"
              onClick={closeSettingsPanel}
            >
              <ArrowLeftIcon className="size-3.5" />
            </button>
            <ServerStatusDot />
            <p className="min-w-0 max-w-[14rem] truncate text-[length:var(--font-size-12)] font-medium">
              {stackedToolbarTitle}
            </p>
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-0.5 shrink-0">
            {!isMac ? (
              <>
                <button
                  type="button"
                  className={TITLEBAR_BTN}
                  title="Minimize"
                  onClick={() => window.electronAPI?.windowMinimize()}
                >
                  <Minimize2Icon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={TITLEBAR_BTN}
                  title={isMaximized ? "Restore" : "Maximize"}
                  onClick={() => window.electronAPI?.windowMaximize()}
                >
                  <Maximize2Icon className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(TITLEBAR_BTN, "hover:bg-destructive hover:text-white")}
                  title="Close"
                  onClick={() => window.electronAPI?.windowClose()}
                >
                  <XIcon className="size-3.5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Toolbar */}
      <div ref={toolbarRef} className="drag-region flex h-[var(--height-titlebar)] shrink-0 items-center gap-0.5 select-none px-2">
        <div className="flex items-center gap-0.5 shrink-0">
        {/* Sidebar controls when sidebar collapsed AND editor maximized */}
        {sidebarFullyCollapsed && editorMaximized && (
          <SidebarControls leftSidebarRef={leftSidebarRef} showMacSpacer={isMac && !isFullscreen} className="-ml-[1px]" />
        )}
        {/* Status dot — visible when ContentTopBar is hidden (editor maximized) */}
        {editorMaximized && (
          <div className="flex items-center ml-0.5">
            <ServerStatusDot />
          </div>
        )}
        </div>

        <div ref={tabBarContainerRef} className="flex-1 min-w-0">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={handleTabSelect}
            onClose={handleTabClose}
            onPinTab={handleTabPin}
            onReorder={handleTabReorder}
            dirtyFileIds={dirtyFileIds}
            forceOverflow={tabsOverflow}
          />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
        {/* ── Tab overflow dropdown (shown when tabs don't fit) ── */}
        {tabsOverflow && tabs.length > 0 && (
          <AppMenu>
            <AppMenuTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="Open tabs"
              >
                <ChevronsLeftRightEllipsisIcon className="size-3.5" />
              </button>
            </AppMenuTrigger>
            <AppMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
              {tabs.map((tab) => (
                <AppMenuItem
                  key={tab.id}
                  onClick={() => handleTabSelect(tab.id)}
                  className={cn(
                    "group pr-1",
                    tab.id === activeTabId && "font-medium",
                  )}
                  trailing={
                    <button
                      type="button"
                      className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTabClose(tab.id);
                      }}
                      title="Close tab"
                    >
                      <XIcon className="size-2.5" />
                    </button>
                  }
                >
                  <span className={cn(tab.isPreview && "italic")}>
                    {tabDisplayTitle(tab, dirtyFileIds)}
                  </span>
                </AppMenuItem>
              ))}
            </AppMenuContent>
          </AppMenu>
        )}

        {/* Window controls when editorMaximized (ContentTopBar is hidden) */}
        {editorMaximized && !isMac && (
          <>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Minimize"
              onClick={() => window.electronAPI?.windowMinimize()}
            >
              <Minimize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
              onClick={() => window.electronAPI?.windowMaximize()}
            >
              <Maximize2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
              title="Close"
              onClick={() => window.electronAPI?.windowClose()}
            >
              <XIcon className="size-3.5" />
            </button>
            <div className="mx-1 h-4 w-px bg-border shrink-0" />
          </>
        )}

        {!compactModes && <div className="mx-1 h-4 w-px bg-border shrink-0" />}

        {/* ── Mode buttons — collapse to dropdown on narrow windows ── */}
        {compactModes ? (
          <AppMenu>
            <AppMenuTrigger asChild>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Modes"
              >
                <LayoutGridIcon className="size-3.5" />
              </button>
            </AppMenuTrigger>
            <AppMenuContent align="end" className="min-w-[8.5rem]">
              {toolbarModes.map((mode) => {
                const isActive = activeModes.includes(mode.id as RightToolbarTab);
                const isFocused = focusedMode === mode.id;
                return (
                  <AppMenuItem
                    key={mode.id}
                    leading={<span className="[&>svg]:size-3.5 shrink-0">{mode.icon}</span>}
                    className={cn(isFocused && "font-medium")}
                    trailing={
                      isActive ? (
                        <span className="text-[length:var(--font-size-10)] text-muted-foreground">
                          on
                        </span>
                      ) : null
                    }
                    onClick={() => handleModeClick(mode.id)}
                  >
                    {mode.label}
                  </AppMenuItem>
                );
              })}
            </AppMenuContent>
          </AppMenu>
        ) : (
          toolbarModes.map((mode) => {
            const isActive = activeModes.includes(mode.id as RightToolbarTab);
            const isFocused = focusedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                className={cn(
                  "flex items-center justify-center rounded transition-all",
                  isActive
                    ? cn(
                        "bg-muted text-foreground h-6 px-1.5 gap-0.5",
                        isFocused && "ring-1 ring-primary/40",
                      )
                    : "size-6 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
                title={isActive && isFocused ? `Close ${mode.label}` : mode.label}
                onClick={() => handleModeClick(mode.id)}
              >
                {mode.icon}
                {isActive && <XIcon className="size-2.5" />}
              </button>
            );
          }))}

        <div className="mx-1 h-4 w-px bg-border shrink-0" />

        {/* Editor maximize / restore */}
        <button
          type="button"
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={editorMaximized ? "Restore Editor" : "Maximize Editor"}
          onClick={() => {
            const c = centerRef.current;
            const r = rightAreaRef.current;
            if (!c || !r) return;
            if (c.isCollapsed()) {
              r.resize(useLayoutStore.getState().rightAreaWidth || 500);
              c.expand();
            } else {
              useLayoutStore.getState().setRightAreaWidth(r.getSize().inPixels);
              c.collapse();
              r.resize(9999);
            }
          }}
        >
          {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
        </button>

        {/* Close right area panel */}
        <button
          type="button"
          className={cn(
            "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            rightAreaExpanded && "bg-muted text-foreground",
          )}
          title="Close Panel"
          onClick={() => {
            const r = rightAreaRef.current;
            const c = centerRef.current;
            if (!r || !c) return;
            // Only save the width if not maximized — otherwise keep the last normal width
            if (!useLayoutStore.getState().editorMaximized) {
              useLayoutStore.getState().setRightAreaWidth(r.getSize().inPixels);
            }
            r.collapse();
            c.resize(9999);
          }}
        >
          <PanelRight className="size-3.5" />
        </button>
        </div>
      </div>

      {/* Tab Toolbar — only shown when a mode is focused and has an active tab */}
      {showTabToolbar && (
        <TabToolbar
          onToggleSidebar={handleToggleSidebar}
          filePath={activeTab.filePath}
          projectName={activeTab.isExternal ? undefined : projectRoot?.split(/[/\\]/).pop()}
          isExternal={activeTab.isExternal}
          hideSpacer={!isEditorKind}
          hideBreadcrumb={focusedMode === "texworkspace"}
        >
          {activeTab && (() => {
            const def = modeRegistry.findByTabKind(activeTab.kind);
            const ToolbarComp = def?.Toolbar;
            return ToolbarComp ? <ToolbarComp tab={activeTab} /> : null;
          })()}
        </TabToolbar>
      )}

      {/* Main content: flex layout — main expands, sidebar stays fixed width */}
      <div ref={containerElRef} className="flex flex-1 min-h-0 min-w-0 relative border-t border-border">
        {!sidebarFull && (
          <div className="flex-1 min-w-[150px]">
            <RightMainArea tabs={tabs} activeTabId={activeTabId} />
          </div>
        )}

        {showModeSidebar && (
          <>
            {!sidebarFull && (
              <SidebarDragHandle
                onResize={handleSidebarResize}
                getStartWidth={getSidebarDragStartWidth}
                isDraggingRef={isDraggingSidebar}
                onDragChange={setSidebarDragActive}
              />
            )}
            <div
              ref={sidebarElRef}
              className="shrink-0 overflow-hidden"
              style={{ width: sidebarFull ? "100%" : effectiveSidebarWidth }}
            >
              <RightSidebar fullMode={sidebarFull} />
            </div>
          </>
        )}

        {editorMaximized && <AiBar />}

        {sidebarDragActive && (
          <div className="fixed inset-0 z-50 cursor-col-resize" />
        )}
      </div>
    </div>
  );
}
