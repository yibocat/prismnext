import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import { ThemeProvider, useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { leftNavRegistry } from "@/lib/workspace/left-nav";
import { registerLeftNavItems } from "@/lib/workspace/left-nav/items";
import { useLayoutStore } from "@/stores/layout-store";
import { runWithProgrammaticCenterResize } from "@/lib/workspace/layout-resize-guard";
import { useSettingsStore } from "@/stores/settings-store";
import { useThemeStore } from "@/stores/theme-store";
import { useDocumentStore } from "@/stores/document-store";
import { useProLicenseStore } from "@/stores/pro-license-store";
import { cn } from "@/lib/utils";
import { injectDiffOverrides } from "@/lib/editor-themes/diff-overrides";
import { registerAllModes } from "@/modes/_register";
import { AppCommandPalette, GlobalErrorBoundary } from "@/components/modules/shared";
import { ProjectSetupDialog, WelcomePage } from "@/components/modules/project";
import { PrismRibbonMark } from "@/components/brand/prism-ribbon-mark";
import { Toaster } from "@/components/ui/sonner";
import { TabCloseConfirmDialog } from "@/components/layout/tab-close-confirm-dialog";
import { LeftSidebar } from "@/components/layout/left-sidebar";
import { LeftMainArea } from "@/components/layout/left-main-area";
import { RightArea } from "@/components/layout/right-area";
import { useAppCloseTab } from "@/hooks/use-app-close-tab";
import { useAppShellShortcuts } from "@/hooks/use-app-shell-shortcuts";
import { useProductShortcuts } from "@/hooks/use-product-shortcuts";
import { useWorkspaceModeShortcuts } from "@/hooks/use-workspace-mode-shortcuts";
import { useExecutionStore } from "@/stores/execution-store";
import { useAiTerminalSweep } from "@/hooks/use-ai-terminal-sweep";
import { useSkillsIntegrationEvents } from "@/hooks/use-skills-integration-events";
import { useAgentCompilePreview } from "@/hooks/use-agent-compile-preview";
import { LocaleSync } from "@/lib/i18n/locale-sync";

import { ContentTopBar } from "@/components/layout/content-top-bar";
import {
  expandSettingsDetailPanel,
  enforceSettingsSplitLayout,
  collapseSettingsDetailPanel,
  closeSettingsDetailPanel,
} from "@/lib/workspace/expand-settings-detail-panel";
import { collapseRightAreaWhenEmpty } from "@/lib/workspace/close-active-tab";
import {
  hasOpenSettingsEditor,
  isSettingsEditorTab,
} from "@/hooks/use-settings-editor";
import { useRightPanelStore } from "@/stores/right-panel-store";
import {
  CENTER_MAXIMIZE_THRESHOLD_PX,
  PANEL_COLLAPSE_THRESHOLD_PX,
  PANEL_RESIZE_HIT,
  RESIZE_FILL_PX,
  SIDEBAR_FULLY_COLLAPSED_PX,
  PANEL_SASH_SEPARATOR_CLASS,
  LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
  SHELL_SASH_SHADOW_RIGHT_CLASS,
  SHELL_SASH_SHADOW_LEFT_CLASS,
} from "@/lib/workspace/layout-constants";
import { isProgrammaticCenterResize, isWindowLayoutResizing, runDuringWindowLayoutResize } from "@/lib/workspace/layout-resize-guard";
import {
  fitSplitRightWidthPx,
  measureMainAreaWidthPx,
  openRightArea,
  reconcileRightAreaOnMainAreaResize,
  resetRightAreaForProjectOpen,
} from "@/lib/workspace/right-area-layout";
import { setLeftNavPanelRefs } from "@/lib/workspace/left-nav/panel-refs";
import {
  SIDEBAR_LEFT_MIN,
  SIDEBAR_LEFT_DEFAULT,
  SIDEBAR_LEFT_MAX,
  MAIN_AREA_MIN,
  RIGHT_AREA_MIN,
  RIGHT_AREA_MAX,
  SIDEBAR_OVERLAY_THRESHOLD,
  RIGHT_AREA_DEFAULT,
} from "@/styles/constants";

// 左侧栏导航注册（与右侧 mode 注册并列）。新入口见 left-nav/items.tsx
registerAllModes();
registerLeftNavItems();

export function App() {
  const isMobile = useIsMobile();
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const setRightAreaWidth = useLayoutStore((s) => s.setRightAreaWidth);
  const setSettingsDetailWidth = useLayoutStore((s) => s.setSettingsDetailWidth);
  const rightAreaExpanded = useLayoutStore((s) => s.rightAreaExpanded);
  const rightSidebarOpen = useLayoutStore((s) => s.rightSidebarOpen);
  const leftSidebarView = useLayoutStore((s) => s.leftSidebarView);
  const editorMaximized = useLayoutStore((s) => s.editorMaximized);
  const rightAreaMin = RIGHT_AREA_MIN;
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const hydrateProLicense = useProLicenseStore((s) => s.hydrate);
  const initTheme = useThemeStore((s) => s.loadConfig);
  const projectRoot = useDocumentStore((s) => s.projectRoot);
  const showWelcome = useDocumentStore((s) => s.showWelcome);
  const isOpeningProject = useDocumentStore((s) => s.isOpeningProject);
  const setShowWelcome = useDocumentStore((s) => s.setShowWelcome);
  const inSettings = leftSidebarView === "settings";
  const settingsDetailStacked = useLayoutStore((s) => s.settingsDetailStacked);
  const hasSettingsEditorTab = useRightPanelStore((s) =>
    s.tabs.some((t) => t.kind === "settings-editor"),
  );
  const settingsDetailOpen = inSettings && hasSettingsEditorTab;
  const sidebarExpanded = useLayoutStore((s) => s.sidebarExpanded);

  const leftSidebarRef = usePanelRef();
  const centerRef = usePanelRef();
  const rightAreaRef = usePanelRef();

  // Expose panel refs for programatic left-nav opens (e.g. Experiments deep-link).
  useLayoutEffect(() => {
    setLeftNavPanelRefs({ centerRef, rightAreaRef });
  }, [centerRef, rightAreaRef]);

  // Last RightArea tab closed (any path) → collapse panel; do not land on the launcher.
  useEffect(() => {
    return useRightPanelStore.subscribe((state, prev) => {
      if (state.tabs.length === 0 && prev.tabs.length > 0) {
        collapseRightAreaWhenEmpty();
      }
    });
  }, []);

  useAppCloseTab();
  useAppShellShortcuts({ leftSidebarRef, centerRef, rightAreaRef }, { isMobile });
  useWorkspaceModeShortcuts({ leftSidebarRef, centerRef, rightAreaRef }, { isMobile });
  useProductShortcuts();
  useEffect(() => {
    return window.electronAPI.onExecutionEvent((event) => {
      const store = useExecutionStore.getState();
      store.applyEvent(event);
      if (event.type !== "created" && event.type !== "started") return;
      void (async () => {
        await store.hydrate(event.executionId);
        const summary = useExecutionStore.getState().byId[event.executionId]?.summary;
        if (summary) useExecutionStore.getState().onExecutionCreated(summary);
      })();
    });
  }, []);
  useAiTerminalSweep();
  useSkillsIntegrationEvents();
  useAgentCompilePreview();

  const rightAreaExpandNonce = useLayoutStore((s) => s.rightAreaExpandNonce);
  const settingsDetailCloseNonce = useLayoutStore((s) => s.settingsDetailCloseNonce);
  const centerExpandNonce = useLayoutStore((s) => s.centerExpandNonce);

  // Programmatic RightArea expand (Browser link chips, settings detail, etc.)
  useLayoutEffect(() => {
    if (rightAreaExpandNonce === 0) return;
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;
    const st = useLayoutStore.getState();
    // Maximized editor: RightArea already full width — do not shrink or restore center.
    if (st.editorMaximized) return;
    if (st.leftSidebarView === "settings" && hasOpenSettingsEditor()) {
      expandSettingsDetailPanel({
        centerRef: c,
        rightAreaRef: r,
        mainAreaWidthPx: measureMainAreaFallback(),
      });
      return;
    }
    if (r.isCollapsed()) {
      openRightArea({
        centerRef: c,
        rightAreaRef: r,
        leftSidebarRef: leftSidebarRef.current,
        isMobile,
      });
    }
    // Already visible — preserve the user's split; do not force resize.
  }, [rightAreaExpandNonce, isMobile]);

  // Programmatic settings detail close (editor Cancel/Save, etc.)
  useLayoutEffect(() => {
    if (settingsDetailCloseNonce === 0) return;
    closeSettingsDetailPanel(centerRef.current, rightAreaRef.current);
  }, [settingsDetailCloseNonce]);

  function measureMainAreaFallback(): number {
    return measureMainAreaWidthPx(leftSidebarRef.current);
  }

  // Programmatic center (Chat) expand — terminal snippet insert, etc.
  useLayoutEffect(() => {
    if (centerExpandNonce === 0) return;
    const c = centerRef.current;
    if (!c?.isCollapsed()) return;
    c.expand();
  }, [centerExpandNonce]);

  // Sync the react-resizable-panels layout to the editorMaximized boolean.
  // When store flips editorMaximized false, expand center + restore the right
  // area to a width that still leaves MAIN_AREA_MIN for Chat (same as openRightArea).
  const rightAreaUnmaxNonce = useLayoutStore((s) => s.rightAreaUnmaxNonce);
  useLayoutEffect(() => {
    if (rightAreaUnmaxNonce === 0) return;
    const r = rightAreaRef.current;
    if (!r) return;
    const preferred = useLayoutStore.getState().rightAreaWidth || RIGHT_AREA_DEFAULT;
    const main = measureMainAreaWidthPx(leftSidebarRef.current);
    const w = fitSplitRightWidthPx(main, preferred);
    runWithProgrammaticCenterResize(() => {
      if (r.isCollapsed()) r.expand();
      r.resize(w);
      centerRef.current?.expand();
    });
  }, [rightAreaUnmaxNonce]);

  // RightArea starts collapsed when opening a project (spec A12).
  useLayoutEffect(() => {
    if (!projectRoot) return;
    resetRightAreaForProjectOpen({
      centerRef: centerRef.current,
      rightAreaRef: rightAreaRef.current,
    });
  }, [projectRoot]);

  // Sidebar overlay: below SIDEBAR_OVERLAY_THRESHOLD (sidebar+main mins), open as
  // fullscreen overlay — inline expand would exceed panel minSizes and collapse the shell.
  // Throttled via requestAnimationFrame — the native resize event can fire faster
  // than 60fps during a window corner drag, causing unnecessary panel API calls
  // and layout thrashing. Coalescing to one check per frame eliminates this.
  const belowOverlayThreshold = useRef(false);
  useLayoutEffect(() => {
    let rafId: number | null = null;
    const check = () => {
      if (rafId !== null) return; // Already scheduled for this frame
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const narrow = window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD;
        const st = useLayoutStore.getState();
        const left = leftSidebarRef.current;

        if (narrow && !belowOverlayThreshold.current) {
          // Crossed below threshold: collapse panel, close any overlay
          if (st.leftSidebarOverlay) st.setLeftSidebarOverlay(false);
          left?.collapse();
          belowOverlayThreshold.current = true;
        } else if (!narrow && belowOverlayThreshold.current) {
          // Crossed above threshold: close overlay, restore panel
          if (st.leftSidebarOverlay) st.setLeftSidebarOverlay(false);
          left?.resize(Math.min(st.sidebarWidth || SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX));
          belowOverlayThreshold.current = false;
        } else if (!narrow && st.leftSidebarOverlay) {
          // Safety net: on wide windows, never allow overlay to persist
          st.setLeftSidebarOverlay(false);
        }

        if (useLayoutStore.getState().leftSidebarView !== "settings") {
          runDuringWindowLayoutResize(() => {
            reconcileRightAreaOnMainAreaResize({
              centerRef: centerRef.current,
              rightAreaRef: rightAreaRef.current,
              leftSidebarRef: leftSidebarRef.current,
              isMobile,
            });
          });
        }
      });
    };
    check();
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("resize", check);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  // Narrow main-area: split → close RightArea (keep Content) or stay maximized.
  useLayoutEffect(() => {
    if (inSettings) return;
    runDuringWindowLayoutResize(() => {
      reconcileRightAreaOnMainAreaResize({
        centerRef: centerRef.current,
        rightAreaRef: rightAreaRef.current,
        leftSidebarRef: leftSidebarRef.current,
        isMobile,
      });
    });
  }, [isMobile, inSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Open-core: hydrate activation key, then tryLoadPro (no-op when Free / absent).
  useEffect(() => {
    void hydrateProLicense();
  }, [hydrateProLicense]);

  // Initialize theme system (injects <style id="prism-theme">)
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Inject diff override CSS once (native <style> tag — beats all CM6 theme CSS)
  useEffect(() => {
    injectDiffOverrides();
  }, []);

  // Sync native vibrancy to next-themes resolved theme
  const { resolvedTheme } = useTheme();
  const glassEffect = useThemeStore((s) => s.config.glassEffect);

  useEffect(() => {
    if (glassEffect && resolvedTheme) {
      window.electronAPI.themeSetGlassMode(
        resolvedTheme as "light" | "dark" | "system"
      ).catch(() => {});
    }
  }, [resolvedTheme, glassEffect]);

  // Reflect chat message-width tier on <html> so [data-chat-width] containers can react.
  // CSS rules live in styles/tokens/chat.css. Effect runs once settings load; falls back
  // to "balanced" (the pre-feature default) when the value is missing.
  const messageWidth = useSettingsStore((s) => s.settings.messageWidth);
  useEffect(() => {
    if (!messageWidth) return;
    document.documentElement.setAttribute("data-message-width", messageWidth);
  }, [messageWidth]);

  // Auto-collapse RightArea when entering immersive center views (leftNavRegistry.isImmersiveCenterView)
  useEffect(() => {
    const r = rightAreaRef.current;
    const st = useLayoutStore.getState();
    if (!r) return;
    if (leftNavRegistry.isImmersiveCenterView(leftSidebarView)) {
      if (st.editorMaximized) st.setEditorMaximized(false);
      if (!r.isCollapsed()) {
        st.setRightAreaWidth(r.getSize().inPixels);
        r.collapse();
        centerRef.current?.resize(RESIZE_FILL_PX);
        st.setPendingRightAreaRestore(true);
      }
    } else if (st.pendingRightAreaRestore && r.isCollapsed()) {
      r.resize(st.rightAreaWidth);
      st.setPendingRightAreaRestore(false);
    }
  }, [leftSidebarView]);

  // Snapshot workspace RightArea tab when entering Settings; restore on exit.
  const prevLeftSidebarViewRef = useRef(leftSidebarView);
  useEffect(() => {
    const prev = prevLeftSidebarViewRef.current;
    prevLeftSidebarViewRef.current = leftSidebarView;

    if (leftSidebarView === "settings" && prev !== "settings") {
      const rp = useRightPanelStore.getState();
      const active = rp.tabs.find((t) => t.id === rp.activeTabId);
      if (active && !isSettingsEditorTab(active)) {
        useLayoutStore.getState().setWorkspaceActiveTabIdBeforeSettings(rp.activeTabId);
      }
      return;
    }

    if (prev === "settings" && leftSidebarView !== "settings") {
      const st = useLayoutStore.getState();
      const snapshot = st.workspaceActiveTabIdBeforeSettings;
      if (snapshot) {
        st.setWorkspaceActiveTabIdBeforeSettings(null);
        const rp = useRightPanelStore.getState();
        if (rp.tabs.some((t) => t.id === snapshot)) {
          rp.setActiveTab(snapshot);
        }
      }
    }
  }, [leftSidebarView]);

  // Settings: keep list visible in split mode; collapse detail pane when no editor is open.
  useEffect(() => {
    if (!inSettings) return;
    const st = useLayoutStore.getState();
    if (st.editorMaximized) st.setEditorMaximized(false);

    if (!hasOpenSettingsEditor()) {
      st.setSettingsDetailStacked(false);
      st.setRightAreaExpanded(false);
      const r = rightAreaRef.current;
      if (r && !r.isCollapsed()) {
        collapseSettingsDetailPanel(centerRef.current, r);
      } else {
        centerRef.current?.expand();
      }
      return;
    }
  }, [inSettings, settingsDetailOpen]);

  // Settings stacked mode: apply panel sizes after React has committed
  // the center panel's collapsible/minSize props for stacked layout.
  useLayoutEffect(() => {
    if (!inSettings || !hasOpenSettingsEditor() || !settingsDetailStacked) return;
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;

    const st = useLayoutStore.getState();
    st.setRightAreaExpanded(true);
    if (r.isCollapsed()) r.expand();
    c?.collapse();
    r.resize(Math.max(measureMainAreaFallback(), RIGHT_AREA_MIN));
  }, [inSettings, settingsDetailOpen, settingsDetailStacked]);

  // Leaving settings: tear down shared right panel state so it does not leak into workspace.
  const prevInSettingsRef = useRef(inSettings);
  useLayoutEffect(() => {
    const exitingSettings = prevInSettingsRef.current && !inSettings;
    prevInSettingsRef.current = inSettings;
    if (!exitingSettings) return;

    const st = useLayoutStore.getState();
    const r = rightAreaRef.current;
    const c = centerRef.current;
    if (!r) return;

    st.setSettingsDetailStacked(false);

    const shouldRestore = st.pendingRightAreaRestore;
    if (shouldRestore) st.clearPendingRightAreaRestore();

    if (hasOpenSettingsEditor()) {
      closeSettingsDetailPanel(c, r);
      if (shouldRestore) {
        r.expand();
        r.resize(st.rightAreaWidth || RIGHT_AREA_DEFAULT);
        st.setRightAreaExpanded(true);
        c?.expand();
      }
      return;
    }

    if (!r.isCollapsed()) {
      st.setRightAreaExpanded(false);
      r.collapse();
      c?.expand();
    }

    if (shouldRestore) {
      r.expand();
      r.resize(st.rightAreaWidth || RIGHT_AREA_DEFAULT);
      st.setRightAreaExpanded(true);
      c?.expand();
    }
  }, [inSettings]);

  // Rebalance settings detail when the window is resized.
  useEffect(() => {
    if (!inSettings) return;
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const st = useLayoutStore.getState();
        if (st.leftSidebarView !== "settings") return;
        if (!hasOpenSettingsEditor()) return;
        const r = rightAreaRef.current;
        if (!r) return;
        expandSettingsDetailPanel({
          centerRef: centerRef.current,
          rightAreaRef: r,
          mainAreaWidthPx: measureMainAreaFallback(),
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [inSettings]);

  useEffect(() => {
    if (projectRoot || !showWelcome) return;
    const st = useSettingsStore.getState();
    if (!st.loaded) {
      const unsub = useSettingsStore.subscribe((s) => {
        if (s.loaded) {
          unsub();
          autoOpen(s.settings.lastProjectPath);
        }
      });
      return;
    }
    autoOpen(st.settings.lastProjectPath);

    async function autoOpen(path?: string | null) {
      if (!path) {
        setAutoOpenChecked(true); // no project → show welcome
        return;
      }
      try {
        const exists = await window.electronAPI.fsExists(path);
        if (exists) {
          // Keep splash (#L) up — do not flip showWelcome yet (avoids blank/welcome flash).
          useDocumentStore.setState({ isOpeningProject: true });
          await useDocumentStore.getState().openProject(path);
          setAutoOpenChecked(true);
        } else {
          setAutoOpenChecked(true); // path doesn't exist → show welcome
        }
      } catch {
        setAutoOpenChecked(true);
      }
    }
  }, []);

  // ── Startup loading screen lifecycle ──
  // Stay on splash until Agent+project warm finishes for auto-open, or welcome
  // is confirmed (no last project / skip). Never treat "left welcome" alone as
  // ready — that used to dismiss splash while Project was still Warming.
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);
  const appReady =
    settingsLoaded &&
    (
      (showWelcome && autoOpenChecked)
      || (Boolean(projectRoot) && !isOpeningProject)
      || (!showWelcome && !projectRoot && autoOpenChecked)
    );

  useEffect(() => {
    if (!appReady) return;
    // ?freeze-splash keeps the loading screen on for design iteration
    if ((window as any).__FREEZE_SPLASH__) return;
    const el = document.getElementById("L");
    if (!el) return;
    el.remove();
  }, [appReady]);

  // While restoring last project, keep splash only — never mount Welcome (flash).
  const showWelcomeUi = showWelcome && autoOpenChecked && !isOpeningProject && !projectRoot;

  return (
    <GlobalErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <LocaleSync />
        <ProjectSetupDialog />
        <AppCommandPalette panelRefs={{ leftSidebarRef, centerRef, rightAreaRef }} isMobile={isMobile} />
        <Toaster />
        <TabCloseConfirmDialog />
        {/* Full-screen warm splash when #L already dismissed (e.g. open from Welcome / switch). */}
        {isOpeningProject && appReady ? (
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-background"
            aria-busy
            aria-label="Loading project"
          >
            <div className="flex flex-col items-center gap-3.5">
              <div className="flex size-14 items-center justify-center rounded-[14px] border border-border bg-card shadow-sm">
                <PrismRibbonMark className="size-8" />
              </div>
              <div className="text-[22px] font-semibold tracking-tight text-foreground">
                PrismNext
              </div>
              <div className="mt-1 h-[3px] w-40 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full w-[35%] rounded-sm bg-foreground/50"
                  style={{ animation: "loading-bar 1.2s ease-in-out infinite" }}
                />
              </div>
            </div>
          </div>
        ) : null}
        {showWelcomeUi ? (
          <WelcomePage onSkip={() => {
            setShowWelcome(false);
            setAutoOpenChecked(true);
          }} />
        ) : projectRoot ? (
          <div className="flex h-full flex-col" key={projectRoot}>
            <Group
              id="main-layout"
              orientation="horizontal"
              className="flex-1 min-h-0"
              resizeTargetMinimumSize={PANEL_RESIZE_HIT}
              disableCursor
            >
              <Panel
                id="left-sidebar"
                panelRef={leftSidebarRef}
                collapsible
                collapsedSize={0}
                minSize={SIDEBAR_LEFT_MIN}
                maxSize={SIDEBAR_LEFT_MAX}
                className="overflow-hidden"
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : Math.min(useLayoutStore.getState().sidebarWidth, SIDEBAR_LEFT_MAX)}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  const st = useLayoutStore.getState();
                  st.setSidebarFullyCollapsed(s.inPixels <= SIDEBAR_FULLY_COLLAPSED_PX);
                  // Only save width when panel is expanded (>= threshold)
                  // to prevent collapse animation from polluting sidebarWidth
                  if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) setSidebarWidth(s.inPixels);
                  if (s.inPixels < PANEL_COLLAPSE_THRESHOLD_PX && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX && !st.sidebarExpanded) st.setSidebarExpanded(true);
                  const immersiveView = leftNavRegistry.isImmersiveCenterView(st.leftSidebarView);
                  if (s.inPixels === 0 && st.editorMaximized && !immersiveView) {
                    rightAreaRef.current?.resize(RESIZE_FILL_PX);
                  }
                }}
              >
                <LeftSidebar leftSidebarRef={leftSidebarRef} centerRef={centerRef} rightAreaRef={rightAreaRef} />
              </Panel>

              <Separator
                id="sep-sidebar"
                className={cn(
                  LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
                  sidebarExpanded && SHELL_SASH_SHADOW_RIGHT_CLASS,
                )}
              />

              <Panel id="main-area" minSize={MAIN_AREA_MIN}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  className="h-full"
                  resizeTargetMinimumSize={PANEL_RESIZE_HIT}
                  disableCursor
                >
                  <Panel
                    id="center"
                    panelRef={centerRef}
                    collapsible={!inSettings || settingsDetailStacked}
                    collapsedSize={0}
                    minSize={inSettings && settingsDetailStacked ? 0 : MAIN_AREA_MIN}
                    className="overflow-hidden"
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (inSettings) {
                        if (!st.settingsDetailStacked) {
                          enforceSettingsSplitLayout(
                            centerRef.current,
                            rightAreaRef.current,
                          );
                        }
                        return;
                      }
                      const immersiveView = leftNavRegistry.isImmersiveCenterView(st.leftSidebarView);
                      if (
                        !immersiveView &&
                        !isProgrammaticCenterResize() &&
                        !isWindowLayoutResizing()
                      ) {
                        if (s.inPixels < CENTER_MAXIMIZE_THRESHOLD_PX && !st.editorMaximized) {
                          st.setEditorMaximized(true);
                        }
                        if (s.inPixels >= CENTER_MAXIMIZE_THRESHOLD_PX && st.editorMaximized) {
                          st.setEditorMaximized(false);
                        }
                      }
                    }}
                  >
                    <div className="flex h-full min-w-0 flex-col">
                      <ContentTopBar
                        leftSidebarRef={leftSidebarRef}
                        centerRef={centerRef}
                        rightAreaRef={rightAreaRef}
                      />
                      <div className="min-h-0 flex-1">
                        <LeftMainArea />
                      </div>
                    </div>
                  </Panel>

                  {/*
                    Collapsed RightArea: keep `w-0` but do NOT strip the hit fringe
                    or set pointer-events-none — first edge-drag to open relies on it.
                    Maximized: hide width only; `disabled` blocks drag (restore via button).
                  */}
                  <Separator
                    id="sep-center-right"
                    className={cn(
                      PANEL_SASH_SEPARATOR_CLASS,
                      rightAreaExpanded &&
                        !(editorMaximized && !inSettings) &&
                        SHELL_SASH_SHADOW_LEFT_CLASS,
                      ((editorMaximized && !inSettings) || !rightAreaExpanded) && "w-0",
                    )}
                    disabled={
                      (editorMaximized && !inSettings) ||
                      (inSettings && settingsDetailStacked)
                    }
                  />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={
                      inSettings
                        ? (settingsDetailOpen ? rightAreaMin : 0)
                        : rightAreaMin
                    }
                    defaultSize={0}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      const r = rightAreaRef.current;
                      if (inSettings && !hasOpenSettingsEditor()) {
                        if (st.settingsDetailStacked) {
                          st.setSettingsDetailStacked(false);
                        }
                        if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) {
                          r?.collapse();
                          st.setRightAreaExpanded(false);
                        }
                        return;
                      }

                      const settingsSlotOpen = inSettings && hasOpenSettingsEditor();

                      if (s.inPixels < PANEL_COLLAPSE_THRESHOLD_PX) {
                        if (st.rightAreaExpanded) st.setRightAreaExpanded(false);
                        if (r && !r.isCollapsed()) {
                          r.collapse();
                        }
                        return;
                      }

                      if (!st.editorMaximized || inSettings) {
                        if (settingsSlotOpen && !st.settingsDetailStacked) {
                          setSettingsDetailWidth(Math.min(s.inPixels, RIGHT_AREA_MAX));
                        } else if (!inSettings) {
                          setRightAreaWidth(Math.min(Math.max(s.inPixels, RIGHT_AREA_MIN), RIGHT_AREA_MAX));
                        }
                      }
                      if (!st.rightAreaExpanded) st.setRightAreaExpanded(true);
                      if (inSettings && !st.settingsDetailStacked && s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) {
                        enforceSettingsSplitLayout(
                          centerRef.current,
                          rightAreaRef.current,
                        );
                      }
                    }}
                  >
                    <RightArea
                      leftSidebarRef={leftSidebarRef}
                      centerRef={centerRef}
                      rightAreaRef={rightAreaRef}
                    />
                  </Panel>
                </Group>
              </Panel>
            </Group>

          </div>
        ) : (
          <div className="flex h-full flex-col">
            <Group
              id="main-layout"
              orientation="horizontal"
              className="flex-1 min-h-0"
              resizeTargetMinimumSize={PANEL_RESIZE_HIT}
              disableCursor
            >
              <Panel
                id="left-sidebar"
                panelRef={leftSidebarRef}
                collapsible
                collapsedSize={0}
                minSize={SIDEBAR_LEFT_MIN}
                maxSize={SIDEBAR_LEFT_MAX}
                className="overflow-hidden"
                defaultSize={window.innerWidth < SIDEBAR_OVERLAY_THRESHOLD ? 0 : Math.min(useLayoutStore.getState().sidebarWidth, SIDEBAR_LEFT_MAX)}
                groupResizeBehavior="preserve-pixel-size"
                onResize={(s) => {
                  const st = useLayoutStore.getState();
                  st.setSidebarFullyCollapsed(s.inPixels <= SIDEBAR_FULLY_COLLAPSED_PX);
                  if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) setSidebarWidth(s.inPixels);
                  if (s.inPixels < PANEL_COLLAPSE_THRESHOLD_PX && st.sidebarExpanded) st.setSidebarExpanded(false);
                  if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX && !st.sidebarExpanded) st.setSidebarExpanded(true);
                }}
              >
                <LeftSidebar leftSidebarRef={leftSidebarRef} centerRef={centerRef} rightAreaRef={rightAreaRef} />
              </Panel>

              <Separator
                id="sep-sidebar"
                className={cn(
                  LEFT_SIDEBAR_SASH_SEPARATOR_CLASS,
                  sidebarExpanded && SHELL_SASH_SHADOW_RIGHT_CLASS,
                )}
              />

              <Panel id="main-area" minSize={MAIN_AREA_MIN}>
                <Group
                  id="center-right"
                  orientation="horizontal"
                  className="h-full"
                  resizeTargetMinimumSize={PANEL_RESIZE_HIT}
                  disableCursor
                >
                  <Panel
                    id="center"
                    panelRef={centerRef}
                    collapsible={!inSettings || settingsDetailStacked}
                    collapsedSize={0}
                    minSize={inSettings && settingsDetailStacked ? 0 : MAIN_AREA_MIN}
                    className="overflow-hidden"
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      if (inSettings && !st.settingsDetailStacked) {
                        enforceSettingsSplitLayout(
                          centerRef.current,
                          rightAreaRef.current,
                        );
                      }
                    }}
                  >
                    <div className="flex h-full min-w-0 flex-col">
                      <ContentTopBar
                        leftSidebarRef={leftSidebarRef}
                        centerRef={centerRef}
                        rightAreaRef={rightAreaRef}
                      />
                      <div className="min-h-0 flex-1">
                        <LeftMainArea />
                      </div>
                    </div>
                  </Panel>

                  <Separator
                    id="sep-center-right"
                    className={cn(
                      PANEL_SASH_SEPARATOR_CLASS,
                      rightAreaExpanded &&
                        !(editorMaximized && !inSettings) &&
                        SHELL_SASH_SHADOW_LEFT_CLASS,
                      ((editorMaximized && !inSettings) || !rightAreaExpanded) && "w-0",
                    )}
                    disabled={
                      (editorMaximized && !inSettings) ||
                      (inSettings && settingsDetailStacked)
                    }
                  />

                  <Panel
                    id="right-area"
                    panelRef={rightAreaRef}
                    collapsible
                    collapsedSize={0}
                    minSize={
                      inSettings
                        ? (settingsDetailOpen ? rightAreaMin : 0)
                        : rightAreaMin
                    }
                    defaultSize={0}
                    groupResizeBehavior="preserve-pixel-size"
                    onResize={(s) => {
                      const st = useLayoutStore.getState();
                      const r = rightAreaRef.current;
                      if (inSettings && !hasOpenSettingsEditor()) {
                        if (st.settingsDetailStacked) {
                          st.setSettingsDetailStacked(false);
                        }
                        if (s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) {
                          r?.collapse();
                          st.setRightAreaExpanded(false);
                        }
                        return;
                      }

                      const settingsSlotOpen = inSettings && hasOpenSettingsEditor();

                      if (s.inPixels < PANEL_COLLAPSE_THRESHOLD_PX) {
                        if (st.rightAreaExpanded) st.setRightAreaExpanded(false);
                        if (r && !r.isCollapsed()) {
                          r.collapse();
                        }
                        return;
                      }

                      if (!st.editorMaximized || inSettings) {
                        if (settingsSlotOpen && !st.settingsDetailStacked) {
                          setSettingsDetailWidth(Math.min(s.inPixels, RIGHT_AREA_MAX));
                        } else if (!inSettings) {
                          setRightAreaWidth(Math.min(Math.max(s.inPixels, RIGHT_AREA_MIN), RIGHT_AREA_MAX));
                        }
                      }
                      if (!st.rightAreaExpanded) st.setRightAreaExpanded(true);
                      if (inSettings && !st.settingsDetailStacked && s.inPixels >= PANEL_COLLAPSE_THRESHOLD_PX) {
                        enforceSettingsSplitLayout(
                          centerRef.current,
                          rightAreaRef.current,
                        );
                      }
                    }}
                  >
                    <RightArea
                      leftSidebarRef={leftSidebarRef}
                      centerRef={centerRef}
                      rightAreaRef={rightAreaRef}
                    />
                  </Panel>
                </Group>
              </Panel>
            </Group>

          </div>
        )}
      </ThemeProvider>
    </GlobalErrorBoundary>
  );
}
