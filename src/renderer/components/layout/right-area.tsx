import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLayoutStore } from "@/stores/layout-store";
import { useFocusedModeId } from "@/lib/workspace/modes-from-tabs";
import { useDocumentStore } from "@/stores/document-store";
import { useRightPanelStore } from "@/stores/right-panel-store";
import { isFileBackedTab, modeNeedsLiveHost, modeRegistry, tabFilePath, tabNeedsLiveHost } from "@/lib/workspace/mode-registry";
import { isRemoteProjectOffline } from "@/lib/remote/ensure-connected";
import { RemoteConnectPrompt } from "@/components/modules/remote/remote-connect-prompt";
import { useRemoteStore } from "@/stores/remote-store";
import { useWindowState } from "@/hooks/use-window-state";
import { RightMainArea } from "@/components/layout/right-main-area";
import { RightSidebar } from "@/components/layout/right-sidebar";
import { TabBar } from "@/components/layout/tab-bar";
import { useRightAreaShortcuts } from "@/hooks/use-right-area-shortcuts";
import { tabDisplayTitle } from "@/lib/workspace/tab-lifecycle";
import { ContentSidebarSpacer, RightAreaHitChrome } from "@/components/layout/sidebar-controls";
import { RightAreaAddMenu } from "@/components/layout/right-area-add-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { ServerStatusDot } from "@/components/server-status-dot";
import { TabToolbar } from "@/components/layout/tab-toolbar";

import { useBrowserStore } from "@/stores/browser-store";
import { openUrlInBrowser } from "@/lib/browser-link";
import { browserDesktop } from "@/lib/desktop-api/browser";
import { fsDesktop } from "@/lib/desktop-api/fs";
import { useTerminalStore } from "@/stores/terminal-store";
import { useGitStore } from "@/stores/git-store";
import { scheduleGitStatusRefresh } from "@/lib/git/checkout-context";
import { AiBar } from "@/components/modules/chat";
import { Hint } from "@/components/ui/hint";
import {
  PanelRight,
  ArrowLeftIcon,
  ChevronsLeftRightEllipsisIcon,
  XIcon,
} from "lucide-react";
import { WindowControls } from "@/components/layout/window-controls";
import {
  clampSidebarDragPreviewWidth,
  clampSidebarWidth,
  computeEffectiveSidebarWidth,
  shouldAutoCloseSplitSidebar,
  shouldExitFullMode,
  RIGHT_AREA_SPLIT_THRESHOLD,
} from "@/lib/workspace/right-area-sidebar-layout";
import { SIDEBAR_RIGHT_MIN } from "@/styles/constants";
import { PANEL_COLLAPSE_THRESHOLD_PX, MODE_SIDEBAR_SASH_CLASS, SHELL_SASH_SHADOW_LEFT_CLASS } from "@/lib/workspace/layout-constants";
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
import { cn } from "@/lib/utils";
import {
  partitionRightTabs,
  resolveSurfaceActiveTabId,
  useActiveSettingsEditorSlot,
} from "@/hooks/use-settings-editor";
import { settingsPanelSlotTitle } from "@/lib/settings/settings-panel-slots";
import { closeSettingsDetailPanel } from "@/lib/workspace/expand-settings-detail-panel";


const TITLEBAR_BTN =
  "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-[color]";

function SidebarDragHandle({
  onResize,
  getStartWidth,
  isDraggingRef,
  onDragChange,
  className,
}: {
  onResize: (width: number) => void;
  /** Visible sidebar width when drag begins (may be squeezed below stored preference). */
  getStartWidth: () => number;
  isDraggingRef?: React.MutableRefObject<boolean>;
  onDragChange?: (dragging: boolean) => void;
  className?: string;
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
      className={cn(MODE_SIDEBAR_SASH_CLASS, className)}
      onMouseDown={handleMouseDown}
    />
  );
}

export function RightArea() {
  return <RightAreaWorkspace />;
}

function RightAreaWorkspace() {
  const { t } = useTranslation();
  const { platform } = useWindowState();
  const isMac = platform === "darwin";
  const isMobile = useIsMobile();

  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const focusedMode = useFocusedModeId();
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const settingsCategory = useLayoutStore((s) => s.settingsCategory);
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
  const prevCategoryRef = useRef(settingsCategory);

  const slotTitle = settingsPanelSlotTitle(settingsSlot);
  const stackedToolbarTitle =
    slotTitle ??
    (settingsSlot ? t("settings.slots.editor") : t("settings.slots.settingsEditor"));

  useEffect(() => {
    if (!inSettings) return;
    if (prevCategoryRef.current === settingsCategory) return;
    prevCategoryRef.current = settingsCategory;
    closeSettingsDetailPanel();
  }, [inSettings, settingsCategory]);

  // Last settings editor tab closed → collapse RightArea (no empty-state pane).
  useEffect(() => {
    if (!inSettings || hasSettingsEditorTab) return;
    closeSettingsDetailPanel();
  }, [inSettings, hasSettingsEditorTab]);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const { settingsTabs, workspaceTabs } = useMemo(() => partitionRightTabs(tabs), [tabs]);
  const surfaceTabs = inSettings ? settingsTabs : workspaceTabs;
  const surfaceActiveTabId = useMemo(
    () => resolveSurfaceActiveTabId(surfaceTabs, activeTabId),
    [surfaceTabs, activeTabId],
  );
  const activeTab = surfaceTabs.find((t) => t.id === surfaceActiveTabId) ?? null;
  const isEditorKind =
    activeTab?.kind === "file"
    || activeTab?.kind === "texworkspace"
    || activeTab?.kind === "research-plan";
  const isSettingsEditorTab = activeTab?.kind === "settings-editor";
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const remoteByProfileId = useRemoteStore((s) => s.byProfileId);
  const hostProjectOffline = !inSettings && isRemoteProjectOffline(projectRoot, remoteByProfileId);
  const hostWorkspaceOffline = hostProjectOffline && modeNeedsLiveHost(focusedMode);
  const showTabToolbar =
    !inSettings &&
    activeTab &&
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab &&
    !hostWorkspaceOffline;
  const modeSidebarEligible =
    !inSettings &&
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab &&
    !hostWorkspaceOffline &&
    !modeRegistry.get(focusedMode)?.hideRightSidebar;
  const mainTabs = hostProjectOffline
    ? surfaceTabs.filter((tab) => !tabNeedsLiveHost(tab))
    : surfaceTabs;

  const closeSettingsPanel = () => {
    closeSettingsDetailPanel();
  };

  // Initialize browser store when project opens
  useEffect(() => {
    if (projectRoot) {
      useBrowserStore.getState().loadFromProject(projectRoot);
    }
  }, [projectRoot]);

  useEffect(() => {
    return browserDesktop.onBrowserOpenInTab(({ url, newTab }) => {
      openUrlInBrowser(url, { newTab });
    });
  }, []);

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
      fsDesktop.fsWatchStart().catch((err) => {
        console.error("[watcher] Failed to start file watcher:", err);
      });
    }
    return () => {
      fsDesktop.fsWatchStop().catch((err) => {
        console.error("[watcher] Failed to stop file watcher:", err);
      });
    };
  }, [checkoutRoot]);

  // ── File watcher: reload files AND refresh git when external changes detected ──
  useEffect(() => {
    const unsubscribe = fsDesktop.onFileChanged(({ changedPaths }) => {
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
      useRightPanelStore.getState().setActiveTab(id);
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
  const COLLAPSE_THRESHOLD = PANEL_COLLAPSE_THRESHOLD_PX;

  const isDraggingSidebar = useRef(false);
  const [sidebarDragActive, setSidebarDragActive] = useState(false);
  const [sidebarDragPreviewWidth, setSidebarDragPreviewWidth] = useState(0);
  /** Raw drag width (unclamped) — used for collapse detection and commit. */
  const sidebarDragRawWidthRef = useRef(0);
  const sidebarDragStartWidthRef = useRef(0);
  const containerElRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [sidebarFullMode, setSidebarFullMode] = useState(false);
  const sidebarFullModeRef = useRef(false);
  useEffect(() => {
    sidebarFullModeRef.current = sidebarFullMode;
  }, [sidebarFullMode]);

  const getSidebarDragStartWidth = useCallback(() => {
    const st = useLayoutStore.getState();
    if (!st.rightSidebarOpen && !sidebarFullModeRef.current) return 0;
    const preferred = st.rightSidebarWidth;
    if (sidebarFullModeRef.current) return preferred;
    const cw = containerElRef.current?.clientWidth ?? 0;
    if (cw <= 0) return preferred;
    return computeEffectiveSidebarWidth(cw, preferred);
  }, []);

  const handleSidebarResize = useCallback((rawWidth: number) => {
    sidebarDragRawWidthRef.current = rawWidth;
    const dragging = isDraggingSidebar.current;
    const previewWidth = dragging
      ? clampSidebarDragPreviewWidth(rawWidth, sidebarDragStartWidthRef.current)
      : rawWidth;
    setSidebarDragPreviewWidth(previewWidth);
    const st = useLayoutStore.getState();

    if (rawWidth >= COLLAPSE_THRESHOLD) {
      if (!st.rightSidebarOpen) st.setRightSidebarOpen(true);
      if (sidebarFullModeRef.current) setSidebarFullMode(false);
      if (!dragging) {
        st.setRightSidebarWidth(clampSidebarWidth(rawWidth));
      }
    } else if (st.rightSidebarOpen) {
      st.setRightSidebarOpen(false);
    }
  }, []);

  const handleSidebarDragChange = useCallback((dragging: boolean) => {
    setSidebarDragActive(dragging);
    if (dragging) {
      sidebarDragStartWidthRef.current = getSidebarDragStartWidth();
    } else {
      const rawWidth = sidebarDragRawWidthRef.current;
      if (rawWidth >= COLLAPSE_THRESHOLD) {
        useLayoutStore.getState().setRightSidebarWidth(clampSidebarWidth(rawWidth));
      }
      setSidebarDragPreviewWidth(0);
      sidebarDragRawWidthRef.current = 0;
      sidebarDragStartWidthRef.current = 0;
    }
  }, [getSidebarDragStartWidth]);

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
        st.setRightSidebarWidth(clampSidebarWidth(actualWidth));
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

  // Fulfill revealRightSidebar() after RightArea has a measurable width
  // (left-nav / openExperimentTab used to race auto-close at width 0).
  const rightSidebarRevealNonce = useLayoutStore((s) => s.rightSidebarRevealNonce);
  useEffect(() => {
    if (rightSidebarRevealNonce <= 0) return;

    const apply = (): boolean => {
      const cw = containerElRef.current?.clientWidth ?? 0;
      if (cw <= 0) return false;
      if (isTooNarrowForSplit(cw)) {
        setSidebarFullMode(true);
      } else {
        setSidebarFullMode(false);
      }
      useLayoutStore.getState().setRightSidebarOpen(true);
      setContainerWidth(cw);
      return true;
    };

    if (apply()) return;
    let tries = 0;
    let raf = 0;
    const tick = () => {
      tries += 1;
      if (apply() || tries > 45) return;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rightSidebarRevealNonce, isTooNarrowForSplit]);

  // ── Mode open/focus: RightAreaAddMenu → openMode

  const sidebarFull = rightSidebarOpen && sidebarFullMode;

  const sidebarPanelVisible =
    rightSidebarOpen ||
    (sidebarDragActive && sidebarDragPreviewWidth >= COLLAPSE_THRESHOLD);

  const sidebarPanelWidth = useMemo(() => {
    const dragging = sidebarDragActive && sidebarDragPreviewWidth > 0;
    const preferred = dragging
      ? sidebarDragPreviewWidth
      : rightSidebarOpen
        ? rightSidebarWidth
        : 0;

    if (preferred <= 0) return 0;
    if (sidebarFull || containerWidth <= 0) return preferred;

    const widthFloor = dragging ? COLLAPSE_THRESHOLD : SIDEBAR_RIGHT_MIN;
    return computeEffectiveSidebarWidth(containerWidth, preferred, undefined, widthFloor);
  }, [
    sidebarFull,
    sidebarDragActive,
    rightSidebarOpen,
    rightSidebarWidth,
    sidebarDragPreviewWidth,
    containerWidth,
  ]);

  // ── Narrow chrome: hide tab strip; tabs live only in the overflow menu ──
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compactChrome, setCompactChrome] = useState(false);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const check = () => setCompactChrome(el.clientWidth < 420);
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
            <ContentSidebarSpacer />
          </div>
          <div className="flex items-center min-w-0 gap-1 ml-0.5 shrink-0">
            <Hint label={t("shell.rightArea.backToSettings")}>
              <button
                type="button"
                className={TITLEBAR_BTN}
                onClick={closeSettingsPanel}
              >
                <ArrowLeftIcon className="size-3.5" />
              </button>
            </Hint>
            <ServerStatusDot />
            <p className="min-w-0 max-w-[14rem] truncate text-[length:var(--font-size-12)] font-medium">
              {stackedToolbarTitle}
            </p>
          </div>
          <div className="flex-1 min-w-0" />
          <div className="flex items-center gap-0.5 shrink-0">
            <WindowControls buttonClassName={TITLEBAR_BTN} />
          </div>
        </div>
      ) : null}

      {/* Toolbar */}
      <div ref={toolbarRef} className="drag-region flex h-[var(--height-titlebar)] min-w-0 shrink-0 items-center justify-end gap-0.5 overflow-hidden select-none px-2">
        <div className="flex items-center gap-0.5 shrink-0">
        {editorMaximized ? <ContentSidebarSpacer /> : null}
        {/* Status dot — visible when ContentTopBar is hidden (editor maximized) */}
        {editorMaximized && (
          <div className="flex items-center ml-0.5" data-status-dot-hit="">
            <ServerStatusDot />
          </div>
        )}
        </div>

        {/* + sits immediately left of the tabs. Maximize / fold stay in RightAreaHitChrome. */}
        <div className="no-drag flex min-w-0 flex-1 items-center justify-end gap-0.5 self-stretch">
          {!inSettings ? (
            <RightAreaAddMenu surface="workspace" isMobile={isMobile} />
          ) : null}
          {!compactChrome ? (
            <div className="min-w-0 max-w-full overflow-hidden self-stretch">
              <TabBar
                tabs={surfaceTabs}
                activeTabId={surfaceActiveTabId}
                onSelect={handleTabSelect}
                onClose={handleTabClose}
                onPinTab={handleTabPin}
                onReorder={handleTabReorder}
                dirtyFileIds={dirtyFileIds}
              />
            </div>
          ) : surfaceTabs.length > 0 ? (
            <AppMenu>
              <Hint label={t("shell.rightArea.openTabs")}>
                <AppMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-[color]"
                  >
                    <ChevronsLeftRightEllipsisIcon className="size-3.5" />
                  </button>
                </AppMenuTrigger>
              </Hint>
              <AppMenuContent align="end" className="w-52 max-h-80 overflow-y-auto">
                {surfaceTabs.map((tab) => (
                  <AppMenuItem
                    key={tab.id}
                    onClick={() => handleTabSelect(tab.id)}
                    className={cn(
                      "group pr-1",
                      tab.id === surfaceActiveTabId && "font-medium",
                    )}
                    trailing={
                      <Hint label={t("menu.closeTab")}>
                        <button
                          type="button"
                          className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/10 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTabClose(tab.id);
                          }}
                        >
                          <XIcon className="size-2.5" />
                        </button>
                      </Hint>
                    }
                  >
                    <span className={cn(tab.isPreview && "italic")}>
                      {tabDisplayTitle(tab, dirtyFileIds)}
                    </span>
                  </AppMenuItem>
                ))}
              </AppMenuContent>
            </AppMenu>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
        {!inSettings ? (
          <RightAreaHitChrome />
        ) : (
          <Hint label={t("shell.rightArea.closePanel")} shortcutId="shell.toggleRightArea">
            <button
              type="button"
              className={cn(
                "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-[color]",
                rightAreaExpanded && "bg-muted text-foreground",
              )}
              onClick={() => {
                closeSettingsDetailPanel();
              }}
            >
              <PanelRight className="size-3.5" />
            </button>
          </Hint>
        )}

        {/* Window controls when editorMaximized (ContentTopBar is hidden) */}
        {editorMaximized && !isMac && (
          <>
            <div className="mx-1 h-4 w-px bg-border shrink-0" />
            <WindowControls />
          </>
        )}
        </div>
      </div>

      {/* Tab Toolbar — only shown when a mode is focused and has an active tab */}
      {showTabToolbar && (
        <TabToolbar
          onToggleSidebar={handleToggleSidebar}
          filePath={tabFilePath(activeTab)}
          projectName={
            isFileBackedTab(activeTab) && activeTab.isExternal
              ? undefined
              : projectRoot?.split(/[/\\]/).pop()
          }
          isExternal={isFileBackedTab(activeTab) ? activeTab.isExternal : undefined}
          hideSpacer={!isEditorKind}
          hideBreadcrumb={focusedMode === "texworkspace" || focusedMode === "literature"}
          hideSidebarToggle={modeRegistry.get(focusedMode)?.hideRightSidebar}
        >
          {activeTab && (() => {
            const def = modeRegistry.findByTabKind(activeTab.kind);
            const ToolbarComp = def?.Toolbar;
            return ToolbarComp ? <ToolbarComp tab={activeTab} /> : null;
          })()}
        </TabToolbar>
      )}

      {/* Main content: flex layout — main expands, sidebar stays fixed width */}
      <div ref={containerElRef} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-[var(--toolbar-edge-line)]">
        {/* Keep mounted when sidebar is full-width — unmounting wiped PDF/editor scroll. */}
        <div
          className={
            sidebarFull
              ? "pointer-events-none invisible absolute inset-0 overflow-hidden"
              : "min-w-0 flex-1 overflow-hidden"
          }
          aria-hidden={sidebarFull}
        >
          {hostWorkspaceOffline ? (
            <RemoteConnectPrompt />
          ) : !inSettings || surfaceTabs.length > 0 ? (
            <RightMainArea tabs={mainTabs} activeTabId={surfaceActiveTabId} />
          ) : null}
        </div>

        {modeSidebarEligible && (
          <>
            {/* Collapsed: omit sash — its ±12px hit fringe sat on the window edge. */}
            {!sidebarFull && sidebarPanelVisible && (
              <SidebarDragHandle
                onResize={handleSidebarResize}
                getStartWidth={getSidebarDragStartWidth}
                isDraggingRef={isDraggingSidebar}
                onDragChange={handleSidebarDragChange}
                className={SHELL_SASH_SHADOW_LEFT_CLASS}
              />
            )}
            {sidebarPanelVisible && (
              <div
                ref={sidebarElRef}
                className="shrink-0 overflow-hidden"
                style={{ width: sidebarFull ? "100%" : sidebarPanelWidth }}
              >
                <RightSidebar fullMode={sidebarFull} />
              </div>
            )}
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
