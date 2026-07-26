import { useEffect, useRef, useState, useCallback, useMemo, type RefObject } from "react";
import { useTranslation } from "react-i18next";
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
import { Hint } from "@/components/ui/hint";
import {
  PanelRight,
  MaximizeIcon,
  MinimizeIcon,
  Minimize2Icon,
  Maximize2Icon,
  XIcon,
  ArrowLeftIcon,
  ChevronsLeftRightEllipsisIcon,
  LayoutGridIcon,
} from "lucide-react";
import {
  clampSidebarDragPreviewWidth,
  clampSidebarWidth,
  computeEffectiveSidebarWidth,
  shouldAutoCloseSplitSidebar,
  shouldExitFullMode,
  RIGHT_AREA_SPLIT_THRESHOLD,
} from "@/lib/workspace/right-area-sidebar-layout";
import { SIDEBAR_RIGHT_MIN } from "@/styles/constants";
import { PANEL_COLLAPSE_THRESHOLD_PX, MODE_SIDEBAR_SASH_CLASS } from "@/lib/workspace/layout-constants";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  closeRightArea,
  toggleRightAreaMaximize,
} from "@/lib/workspace/right-area-layout";
import { deactivateModeFromToolbar } from "@/lib/workspace/deactivate-mode";

/** RightArea toolbar mode → open (split) shortcut. */
const MODE_TOOLBAR_SHORTCUT: Partial<Record<string, string>> = {
  texworkspace: "workspace.openTexWorkspace",
  literature: "workspace.openLiterature",
  experiments: "workspace.openExperiments",
  files: "workspace.openFiles",
  git: "workspace.openGit",
  browser: "workspace.openBrowser",
  terminal: "workspace.openTerminal",
};
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuTrigger,
} from "@/components/ui/app-menu";
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
      className={MODE_SIDEBAR_SASH_CLASS}
      onMouseDown={handleMouseDown}
    />
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
  const { t } = useTranslation();
  const { platform, isMaximized, isFullscreen } = useWindowState();
  const isMobile = useIsMobile();
  const isMac = platform === "darwin";

  const modeLabel = useCallback(
    (mode: { label: string; labelKey?: string }) =>
      mode.labelKey ? t(mode.labelKey) : mode.label,
    [t],
  );

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
  const stackedToolbarTitle =
    slotTitle ??
    (settingsSlot ? t("settings.slots.editor") : t("settings.slots.settingsEditor"));

  useEffect(() => {
    if (!inSettings) return;
    if (prevCategoryRef.current === settingsCategory) return;
    prevCategoryRef.current = settingsCategory;
    closeSettingsDetailPanel(centerRef.current, rightAreaRef.current);
  }, [inSettings, settingsCategory, centerRef, rightAreaRef]);

  const tabs = useRightPanelStore((s) => s.tabs);
  const activeTabId = useRightPanelStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isEditorKind =
    activeTab?.kind === "file"
    || activeTab?.kind === "texworkspace"
    || activeTab?.kind === "research-plan";
  const isSettingsEditorTab = activeTab?.kind === "settings-editor";
  const showTabToolbar =
    activeTab &&
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab;
  const modeSidebarEligible =
    focusedMode !== "dashboard" &&
    !isSettingsEditorTab &&
    !modeRegistry.get(focusedMode)?.hideRightSidebar;

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
    if (compactModesRef.current) return;

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
        // Auto-open mode sidebar (split or narrow full-overlay) once container is ready.
        if (!compactModesRef.current) {
          useLayoutStore.getState().revealRightSidebar();
        }
      } else if (focusedMode === target) {
        // ── Deactivate mode (Terminal keeps tabs/PTY; others close tabs) ──
        deactivateModeFromToolbar(target);
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
            {!isMac ? (
              <>
                <Hint label={t("shell.minimize")}>
                  <button
                    type="button"
                    className={TITLEBAR_BTN}
                    onClick={() => window.electronAPI?.windowMinimize()}
                  >
                    <Minimize2Icon className="size-3.5" />
                  </button>
                </Hint>
                <Hint label={isMaximized ? t("shell.restore") : t("shell.maximize")}>
                  <button
                    type="button"
                    className={TITLEBAR_BTN}
                    onClick={() => window.electronAPI?.windowMaximize()}
                  >
                    <Maximize2Icon className="size-3.5" />
                  </button>
                </Hint>
                <Hint label={t("shell.close")}>
                  <button
                    type="button"
                    className={cn(TITLEBAR_BTN, "hover:bg-destructive hover:text-white")}
                    onClick={() => window.electronAPI?.windowClose()}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </Hint>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Toolbar */}
      <div ref={toolbarRef} className="drag-region flex h-[var(--height-titlebar)] min-w-0 shrink-0 items-center gap-0.5 overflow-hidden select-none px-2">
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

        <div ref={tabBarContainerRef} className="no-drag flex-1 min-w-0 self-stretch">
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
            <Hint label={t("shell.rightArea.openTabs")}>
              <AppMenuTrigger asChild>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <ChevronsLeftRightEllipsisIcon className="size-3.5" />
                </button>
              </AppMenuTrigger>
            </Hint>
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
        )}

        {/* Window controls when editorMaximized (ContentTopBar is hidden) */}
        {editorMaximized && !isMac && (
          <>
            <Hint label={t("shell.minimize")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => window.electronAPI?.windowMinimize()}
              >
                <Minimize2Icon className="size-3.5" />
              </button>
            </Hint>
            <Hint label={isMaximized ? t("shell.restore") : t("shell.maximize")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                onClick={() => window.electronAPI?.windowMaximize()}
              >
                <Maximize2Icon className="size-3.5" />
              </button>
            </Hint>
            <Hint label={t("shell.close")}>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-white transition-colors"
                onClick={() => window.electronAPI?.windowClose()}
              >
                <XIcon className="size-3.5" />
              </button>
            </Hint>
            <div className="mx-1 h-4 w-px bg-border shrink-0" />
          </>
        )}

        {!compactModes && <div className="mx-1 h-4 w-px bg-border shrink-0" />}

        {/* ── Mode buttons — collapse to dropdown on narrow windows ── */}
        {compactModes ? (
          <AppMenu>
            <Hint label={t("shell.rightArea.modes")}>
              <AppMenuTrigger asChild>
                <button
                  type="button"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <LayoutGridIcon className="size-3.5" />
                </button>
              </AppMenuTrigger>
            </Hint>
            <AppMenuContent align="end" className="min-w-[8.5rem]">
              {toolbarModes.map((mode) => {
                const isActive = activeModes.includes(mode.id as RightToolbarTab);
                const isFocused = focusedMode === mode.id;
                const label = modeLabel(mode);
                return (
                  <AppMenuItem
                    key={mode.id}
                    leading={<span className="[&>svg]:size-3.5 shrink-0">{mode.icon}</span>}
                    className={cn(isFocused && "font-medium")}
                    trailing={
                      isActive ? (
                        <span className="text-[length:var(--font-size-10)] text-muted-foreground">
                          {t("modes.on")}
                        </span>
                      ) : null
                    }
                    onClick={() => handleModeClick(mode.id)}
                  >
                    {label}
                  </AppMenuItem>
                );
              })}
            </AppMenuContent>
          </AppMenu>
        ) : (
          toolbarModes.map((mode) => {
            const isActive = activeModes.includes(mode.id as RightToolbarTab);
            const isFocused = focusedMode === mode.id;
            const label = modeLabel(mode);
            return (
              <Hint
                key={mode.id}
                label={
                  isActive && isFocused
                    ? t("modes.closeMode", { label })
                    : label
                }
                shortcutId={MODE_TOOLBAR_SHORTCUT[mode.id]}
              >
                <button
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
                  onClick={() => handleModeClick(mode.id)}
                >
                  {mode.icon}
                  {isActive && <XIcon className="size-2.5" />}
                </button>
              </Hint>
            );
          }))}

        <div className="mx-1 h-4 w-px bg-border shrink-0" />

        {/* Editor maximize / restore */}
        <Hint
          label={
            editorMaximized
              ? t("shell.rightArea.restorePanel")
              : t("shell.rightArea.maximizePanel")
          }
          shortcutId="shell.toggleRightAreaMaximize"
        >
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            onClick={() => {
              toggleRightAreaMaximize({
                centerRef: centerRef.current,
                rightAreaRef: rightAreaRef.current,
                leftSidebarRef: leftSidebarRef.current,
                isMobile,
              });
            }}
          >
            {editorMaximized ? <MinimizeIcon className="size-3.5" /> : <MaximizeIcon className="size-3.5" />}
          </button>
        </Hint>

        {/* Close right area panel */}
        <Hint label={t("shell.rightArea.closePanel")} shortcutId="shell.toggleRightArea">
          <button
            type="button"
            className={cn(
              "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              rightAreaExpanded && "bg-muted text-foreground",
            )}
            onClick={() => {
              closeRightArea({
                centerRef: centerRef.current,
                rightAreaRef: rightAreaRef.current,
              });
            }}
          >
            <PanelRight className="size-3.5" />
          </button>
        </Hint>
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
      <div ref={containerElRef} className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden border-t border-border">
        {/* Keep mounted when sidebar is full-width — unmounting wiped PDF/editor scroll. */}
        <div
          className={
            sidebarFull
              ? "pointer-events-none invisible absolute inset-0 overflow-hidden"
              : "min-w-0 flex-1 overflow-hidden"
          }
          aria-hidden={sidebarFull}
        >
          <RightMainArea tabs={tabs} activeTabId={activeTabId} />
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
